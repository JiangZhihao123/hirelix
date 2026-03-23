import fs from "node:fs";
import { fetch as undiciFetch, ProxyAgent } from "undici";

const envPath = "/Users/noah/projects/hirelix/.env";
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (!match) return;
    const key = match[1].trim();
    const value = match[2].trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

const API_TOKEN = process.env.BRIGHTDATA_API_TOKEN;
const DATASET_ID =
  process.env.BRIGHTDATA_RECALL_DATASET_ID || process.env.BRIGHTDATA_DATASET_ID;
const PROXY_URL =
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  null;
const PROXY_AGENT = PROXY_URL ? new ProxyAgent(PROXY_URL) : null;

if (!API_TOKEN) throw new Error("Missing BRIGHTDATA_API_TOKEN");
if (!DATASET_ID) throw new Error("Missing BRIGHTDATA_DATASET_ID");

const REQUEST_LIMIT = Math.max(1, Number(process.argv[2] || "10"));

const FILTER_REQUEST = {
  dataset_id: DATASET_ID,
  records_limit: REQUEST_LIMIT,
  filter: {
    operator: "and",
    filters: [
      {
        operator: "or",
        filters: [
          { name: "position", operator: "includes", value: "software engineer" },
          { name: "position", operator: "includes", value: "backend engineer" },
        ],
      },
      { name: "country_code", operator: "=", value: "US" },
      { name: "default_avatar", operator: "=", value: false },
      { name: "connections", operator: ">=", value: 50 },
    ],
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function brightFetch(url, init = {}) {
  if (!PROXY_AGENT) return fetch(url, init);
  return undiciFetch(url, { ...init, dispatcher: PROXY_AGENT });
}

function isRetryableNetworkError(error) {
  const code = error?.cause?.code || error?.code || "";
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT";
}

async function withNetworkRetry(fn, label, maxAttempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt >= maxAttempts) {
        throw error;
      }
      console.log(`[RETRY] label=${label} attempt=${attempt} code=${error?.cause?.code || error?.code || "unknown"}`);
      await sleep(1500 * attempt);
    }
  }
  throw lastError;
}

function msSince(start) {
  return Date.now() - start;
}

function isoNow() {
  return new Date().toISOString();
}

async function triggerSnapshot() {
  const res = await withNetworkRetry(
    () =>
      brightFetch("https://api.brightdata.com/datasets/filter", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(FILTER_REQUEST),
      }),
    "trigger",
  );

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Trigger failed (${res.status}): ${text}`);
  }

  return JSON.parse(text);
}

async function getMetadata(snapshotId) {
  const res = await withNetworkRetry(
    () =>
      brightFetch(`https://api.brightdata.com/datasets/snapshots/${snapshotId}`, {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
        },
      }),
    "metadata",
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Metadata failed (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

async function tryDownload(snapshotId) {
  const res = await withNetworkRetry(
    () =>
      brightFetch(
        `https://api.brightdata.com/datasets/snapshots/${snapshotId}/download?format=json`,
        {
          headers: {
            Authorization: `Bearer ${API_TOKEN}`,
          },
        },
      ),
    "download",
  );
  const text = await res.text();
  return {
    status: res.status,
    ok: res.ok,
    text,
  };
}

async function main() {
  const startedAt = Date.now();
  console.log(`[START] ${isoNow()}`);
  console.log(`[FILTER] ${JSON.stringify(FILTER_REQUEST)}`);

  const triggerStartedAt = Date.now();
  const triggerData = await triggerSnapshot();
  const triggerFinishedAt = Date.now();
  const snapshotId = triggerData.snapshot_id;

  console.log(`[TRIGGER] snapshot_id=${snapshotId}`);
  console.log(
    `[TRIGGER_TIME] ms=${triggerFinishedAt - triggerStartedAt} at=${new Date(triggerFinishedAt).toISOString()}`,
  );

  let metadataReadyAt = null;
  let metadataAtReady = null;
  let downloadReadyAt = null;
  let downloadRows = null;
  let metadataPolls = 0;
  let downloadAttempts = 0;

  while (!downloadReadyAt && msSince(startedAt) < 60 * 60 * 1000) {
    metadataPolls += 1;
    const metadata = await getMetadata(snapshotId);
    console.log(
      `[META] poll=${metadataPolls} status=${metadata.status} dataset_size=${metadata.dataset_size ?? "null"} cost=${metadata.cost ?? "null"} elapsed_ms=${msSince(startedAt)}`,
    );

    if (metadata.status === "failed") {
      console.log(`[FINAL_JSON]${JSON.stringify({
        snapshot_id: snapshotId,
        trigger_time_ms: triggerFinishedAt - triggerStartedAt,
        metadata_ready_time_ms: metadataReadyAt ? metadataReadyAt - startedAt : null,
        download_ready_time_ms: null,
        total_time_ms: msSince(startedAt),
        metadata_polls: metadataPolls,
        download_attempts,
        final_metadata: metadata,
        failure: "snapshot_failed",
      })}`);
      return;
    }

    if (metadata.status === "ready") {
      if (!metadataReadyAt) {
        metadataReadyAt = Date.now();
        metadataAtReady = metadata;
        console.log(
          `[META_READY] at=${new Date(metadataReadyAt).toISOString()} elapsed_ms=${metadataReadyAt - startedAt}`,
        );
      }

      downloadAttempts += 1;
      const download = await tryDownload(snapshotId);
      const preview = download.text.slice(0, 140).replace(/\s+/g, " ");
      console.log(
        `[DOWNLOAD] attempt=${downloadAttempts} status=${download.status} ok=${download.ok} elapsed_ms=${msSince(startedAt)} body=${JSON.stringify(preview)}`,
      );

      if (download.ok) {
        try {
          const parsed = JSON.parse(download.text);
          if (Array.isArray(parsed)) {
            downloadReadyAt = Date.now();
            downloadRows = parsed;
            break;
          }
        } catch {
          // keep polling until JSON is actually available
        }
      }
    }

    await sleep(5000);
  }

  console.log(
    `[FINAL_JSON]${JSON.stringify({
      snapshot_id: snapshotId,
      trigger_time_ms: triggerFinishedAt - triggerStartedAt,
      metadata_ready_time_ms: metadataReadyAt ? metadataReadyAt - startedAt : null,
      download_ready_time_ms: downloadReadyAt ? downloadReadyAt - startedAt : null,
      ready_to_download_gap_ms:
        metadataReadyAt && downloadReadyAt ? downloadReadyAt - metadataReadyAt : null,
      total_time_ms: msSince(startedAt),
      metadata_polls: metadataPolls,
      download_attempts: downloadAttempts,
      final_metadata: metadataAtReady,
      downloaded_record_count: Array.isArray(downloadRows) ? downloadRows.length : null,
      first_record: Array.isArray(downloadRows) && downloadRows.length > 0
        ? {
            name: downloadRows[0].name ?? null,
            headline: downloadRows[0].headline ?? null,
            city: downloadRows[0].city ?? null,
            country_code: downloadRows[0].country_code ?? null,
            url: downloadRows[0].url ?? null,
          }
        : null,
    })}`);
}

main().catch((error) => {
  console.error("fatal_error", error);
  process.exit(1);
});

import { Agent, ProxyAgent, setGlobalDispatcher, type Dispatcher } from "undici";

import { getLogger } from "@/lib/logger";

let initialized = false;
const directLoopbackDispatcher = new Agent();
const networkLogger = getLogger({ component: "network" });

function getConfiguredBoolean(envName: string) {
  const raw = process.env[envName];
  if (raw == null) return null;

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function getProxyUrl() {
  return (
    process.env.PROXY_URL ||
    process.env.OUTBOUND_PROXY_URL ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    null
  );
}

function shouldEnableProxy(proxyUrl: string | null) {
  const explicit =
    getConfiguredBoolean("PROXY_ENABLED") ??
    getConfiguredBoolean("OUTBOUND_PROXY_ENABLED");
  if (explicit != null) {
    return explicit && Boolean(proxyUrl);
  }

  return process.env.NODE_ENV === "development" && Boolean(proxyUrl);
}

export function getOutboundProxySettings() {
  const proxyUrl = getProxyUrl();
  const enabled = shouldEnableProxy(proxyUrl);
  return {
    enabled,
    proxyUrl: enabled ? proxyUrl : null,
  };
}

export function initializeGlobalOutboundProxy() {
  if (initialized) return;
  initialized = true;

  const { enabled, proxyUrl } = getOutboundProxySettings();
  if (!enabled || !proxyUrl) {
    return;
  }

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  const proxyHost = (() => {
    try {
      return new URL(proxyUrl).host;
    } catch {
      return "configured";
    }
  })();
  networkLogger.info({
    event: "global_outbound_proxy_enabled",
    proxy_host: proxyHost,
  });
}

export function shouldBypassOutboundProxyForUrl(target: string | URL) {
  let url: URL;

  try {
    url = typeof target === "string" ? new URL(target) : target;
  } catch {
    return false;
  }

  const normalizedHostname = url.hostname.replace(/^\[(.*)\]$/, "$1");
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(normalizedHostname);
}

export function getFetchDispatcherForUrl(target: string | URL): Dispatcher | undefined {
  if (!shouldBypassOutboundProxyForUrl(target)) {
    return undefined;
  }

  return directLoopbackDispatcher;
}

import { ProxyAgent, setGlobalDispatcher } from "undici";

let initialized = false;

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
    process.env.OUTBOUND_PROXY_URL ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    null
  );
}

function shouldEnableProxy(proxyUrl: string | null) {
  const explicit = getConfiguredBoolean("OUTBOUND_PROXY_ENABLED");
  if (explicit != null) {
    return explicit && Boolean(proxyUrl);
  }

  return process.env.NODE_ENV === "development" && Boolean(proxyUrl);
}

export function initializeGlobalOutboundProxy() {
  if (initialized) return;
  initialized = true;

  const proxyUrl = getProxyUrl();
  if (!shouldEnableProxy(proxyUrl) || !proxyUrl) {
    return;
  }

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`[network] Global outbound proxy enabled: ${proxyUrl}`);
}

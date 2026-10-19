export type TrafficKind = "human" | "data_center" | "local";
export type IpNetworkType = "residential" | "business" | "data_center" | "unknown";

export type IpAttribution = {
  ipAddress: string;
  maskedIp: string;
  country: string;
  region: string;
  city: string;
  networkType: IpNetworkType;
  org: string;
  asn: string;
};

export function classifyTraffic(params: {
  ipAttribution?: IpAttribution | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  eventTypes?: Iterable<string>;
  pageStaySeconds?: number;
  activeReadSeconds?: number;
  interactionCount?: number;
  maxScrollDepth?: number;
  sessionCountForIpUa?: number;
}): TrafficKind {
  if (isLocalOrPrivateIp(params.ipAddress)) {
    return "local";
  }
  if (isDataCenterVisit(params.ipAttribution, params.ipAddress)) {
    return "data_center";
  }
  return "human";
}

export function isLocalOrPrivateIp(ipAddress: string | null | undefined) {
  if (!ipAddress) return false;
  const normalized = ipAddress.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized) return false;
  if (normalized === "localhost" || normalized === "::" || normalized === "::1") return true;

  const mappedIpv4 = normalized.startsWith("::ffff:")
    ? normalized.slice("::ffff:".length)
    : normalized;
  const parts = mappedIpv4.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [first, second] = parts;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

function isDataCenterVisit(
  ipAttribution: IpAttribution | null | undefined,
  ipAddress: string | null | undefined,
) {
  return ipAttribution?.networkType === "data_center" || isCloudOrSecurityIp(ipAddress);
}

function isCloudOrSecurityIp(ipAddress: string | null | undefined) {
  if (!ipAddress) return false;
  return (
    isIpv4InCidr(ipAddress, "34.64.0.0", 10) ||
    isIpv4InCidr(ipAddress, "72.144.0.0", 14)
  );
}

function isIpv4InCidr(ipAddress: string, cidrBase: string, prefixLength: number) {
  const ip = ipv4ToNumber(ipAddress);
  const base = ipv4ToNumber(cidrBase);
  if (ip === null || base === null) return false;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ip & mask) === (base & mask);
}

function ipv4ToNumber(ipAddress: string) {
  const parts = ipAddress.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const value = Number.parseInt(part, 10);
    if (!Number.isInteger(value) || value < 0 || value > 255) return null;
    result = ((result << 8) + value) >>> 0;
  }
  return result;
}


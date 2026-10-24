/** First-party acquisition labels only. Never put identities or full URLs in a touch. */
export const ATTRIBUTION_COOKIE = "hirelix_acquisition";
export const ATTRIBUTION_STORAGE = "hirelix.growth.touches.v1";
export const ATTRIBUTION_MAX_AGE = 90 * 86400;
export const ATTRIBUTION_FIELDS = ["traffic_source", "utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;
export type AcquisitionTouch = { traffic_source: string; at: number } & Partial<Record<(typeof ATTRIBUTION_FIELDS)[number], string>>;
export type AcquisitionState = { first: AcquisitionTouch; latest: AcquisitionTouch };

export function acquisitionLabel(value: unknown) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_.~-]{0,119}$/i.test(value) ? value : undefined;
}

function readTouch(value: unknown, now: number): AcquisitionTouch | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!acquisitionLabel(input.traffic_source) || typeof input.at !== "number" || !Number.isFinite(input.at) ||
    input.at > now + 60000 || input.at < now - ATTRIBUTION_MAX_AGE * 1000) return null;
  const touch: AcquisitionTouch = { traffic_source: input.traffic_source as string, at: input.at };
  for (const key of ATTRIBUTION_FIELDS) {
    const label = acquisitionLabel(input[key]);
    if (label) touch[key] = label;
  }
  return touch;
}

export function readAcquisitionState(value: unknown, now = Date.now()): AcquisitionState | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const first = readTouch(input.first, now), latest = readTouch(input.latest, now);
  return first && latest && first.at <= latest.at ? { first, latest } : null;
}

export function resolveAcquisition(previous: AcquisitionState | null, input: Record<string, unknown>, newEntry: boolean, now = Date.now()): AcquisitionState {
  const candidate = readTouch({ ...input, traffic_source: acquisitionLabel(input.traffic_source) || "direct", at: now }, now)!;
  const prior = readAcquisitionState(previous, now);
  if (!prior) {
    const touch = newEntry || candidate.traffic_source === "direct" ? candidate : { traffic_source: "direct", at: now };
    return { first: touch, latest: touch };
  }
  // Internal navigation and direct returns never erase a known external source.
  return { first: prior.first, latest: newEntry && candidate.traffic_source !== "direct" ? candidate : prior.latest };
}

export function acquisitionMetadata(state: AcquisitionState) {
  const result: Record<string, string> = {};
  for (const [prefix, touch] of [["first", state.first], ["latest", state.latest]] as const) {
    for (const key of ATTRIBUTION_FIELDS) {
      if (touch[key]) result[`${prefix}_${key}`] = touch[key]!;
    }
  }
  return result;
}

export function readAcquisitionCookie(cookie: string, now = Date.now()) {
  const value = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${ATTRIBUTION_COOKIE}=`))?.slice(ATTRIBUTION_COOKIE.length + 1);
  if (!value || value.length > 3500) return null;
  try {
    const input = JSON.parse(decodeURIComponent(value));
    const state = readAcquisitionState(input, now);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return state && uuid.test(input.visitor_id) && uuid.test(input.session_id)
      ? { ...state, visitor_id: input.visitor_id as string, session_id: input.session_id as string }
      : null;
  } catch {
    return null;
  }
}

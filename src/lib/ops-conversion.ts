export type GrowthEventRecord = {
  id?: string;
  event_type: string;
  visitor_id: string | null;
  session_id: string | null;
  email_id?: string | null;
  batch_id?: string | null;
  recipient?: string | null;
  company?: string | null;
  page_url: string | null;
  referrer: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
};

export type OpsRange = "today" | "yesterday" | "7d" | "30d";
export type TrafficKind = "human" | "bot" | "preview" | "suspicious" | "low_quality";

export type OpsConversionData = {
  range: {
    key: OpsRange;
    label: string;
    start: string;
    end: string;
  };
  summary: {
    humanVisits: number;
    filteredVisits: number;
    suspiciousVisits: number;
    humanRatio: number;
    effectiveClicks: number;
    loginAttempts: number;
    successfulLogins: number;
    createdSearches: number;
    medianStaySeconds: number;
    averageActiveSeconds: number;
    leftWithin10Seconds: number;
    stayed30Seconds: number;
    stayed60Seconds: number;
    stayed180Seconds: number;
    highInterestNoAction: number;
  };
  duration: {
    pageStayBuckets: DurationBucket[];
    activeReadBuckets: DurationBucket[];
  };
  funnel: FunnelStep[];
  sources: SourceSummary[];
  recentHumanEvents: RecentHumanEvent[];
  filteredTraffic: FilteredTrafficSummary[];
  diagnosis: string;
};

export type DurationBucket = {
  key: string;
  label: string;
  count: number;
};

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  rateFromPrevious: number | null;
};

export type SourceSummary = {
  source: string;
  humanVisits: number;
  effectiveClicks: number;
  successfulLogins: number;
  createdSearches: number;
  clickRate: number;
};

export type RecentHumanEvent = {
  time: string;
  label: string;
  source: string;
  details: string;
};

export type FilteredTrafficSummary = {
  kind: Exclude<TrafficKind, "human">;
  label: string;
  count: number;
};

type SessionSummary = {
  sessionId: string;
  visitorId: string | null;
  source: string;
  userAgent: string;
  ipAddress: string | null;
  firstEventAt: Date;
  lastEventAt: Date;
  eventTypes: Set<string>;
  metadata: Record<string, unknown>;
  pageStaySeconds: number;
  activeReadSeconds: number;
  maxScrollDepth: number;
  interactionCount: number;
  sectionViewCount: number;
};

const BOT_UA_PATTERN =
  /bot|crawler|spider|monitor|headless|curl|python|wget|go-http-client|httpclient|urlscan|virustotal|appengine-google|proofpoint|mimecast|barracuda|mandrill|sendgrid|mailchimp/i;
const PREVIEW_UA_PATTERN =
  /preview|linkedinbot|slackbot|twitterbot|facebookexternalhit|discordbot|telegrambot|whatsapp|skypeuripreview|googleimageproxy|linkexpand/i;

const HUMAN_SIGNAL_EVENTS = new Set([
  "engaged_10s",
  "engaged_30s",
  "engaged_60s",
  "engaged_180s",
  "session_summary",
  "section_view",
  "hero_input_start",
  "hero_submit_attempt",
  "signin_view",
  "google_signin_click",
  "signup_success",
  "new_search_view",
  "search_create_success",
  "search_create_failed",
  "sample_view",
  "preview_request_click",
  "preview_request_submit",
  "book_feedback_click",
  "reply_email_click",
]);

const EFFECTIVE_CLICK_EVENTS = new Set([
  "hero_submit_attempt",
  "google_signin_click",
  "preview_request_click",
  "preview_request_submit",
  "book_feedback_click",
  "reply_email_click",
]);

export const PAGE_STAY_BUCKETS: Array<Omit<DurationBucket, "count"> & { min: number; max: number }> = [
  { key: "0_3", label: "0-3秒", min: 0, max: 3 },
  { key: "4_10", label: "4-10秒", min: 4, max: 10 },
  { key: "11_30", label: "11-30秒", min: 11, max: 30 },
  { key: "31_60", label: "31-60秒", min: 31, max: 60 },
  { key: "61_180", label: "1-3分钟", min: 61, max: 180 },
  { key: "181_600", label: "3-10分钟", min: 181, max: 600 },
  { key: "600_plus", label: "10分钟以上", min: 601, max: Number.POSITIVE_INFINITY },
];

export const ACTIVE_READ_BUCKETS: Array<Omit<DurationBucket, "count"> & { min: number; max: number }> = [
  { key: "0_3", label: "0-3秒", min: 0, max: 3 },
  { key: "4_15", label: "4-15秒", min: 4, max: 15 },
  { key: "16_45", label: "16-45秒", min: 16, max: 45 },
  { key: "46_120", label: "46-120秒", min: 46, max: 120 },
  { key: "121_300", label: "121-300秒", min: 121, max: 300 },
  { key: "300_plus", label: "300秒以上", min: 301, max: Number.POSITIVE_INFINITY },
];

export function bucketPageStaySeconds(seconds: number): string {
  return findBucket(PAGE_STAY_BUCKETS, seconds).label;
}

export function bucketActiveReadSeconds(seconds: number): string {
  return findBucket(ACTIVE_READ_BUCKETS, seconds).label;
}

export function classifyTraffic(params: {
  userAgent?: string | null;
  eventTypes?: Iterable<string>;
  pageStaySeconds?: number;
  activeReadSeconds?: number;
  interactionCount?: number;
  maxScrollDepth?: number;
  sessionCountForIpUa?: number;
}): TrafficKind {
  const userAgent = params.userAgent ?? "";
  if (PREVIEW_UA_PATTERN.test(userAgent)) return "preview";
  if (BOT_UA_PATTERN.test(userAgent)) return "bot";

  const eventTypes = new Set(params.eventTypes ?? []);
  const hasHumanSignal = [...eventTypes].some((eventType) => HUMAN_SIGNAL_EVENTS.has(eventType));
  const interactionCount = params.interactionCount ?? 0;
  const maxScrollDepth = params.maxScrollDepth ?? 0;
  const pageStaySeconds = params.pageStaySeconds ?? 0;
  const activeReadSeconds = params.activeReadSeconds ?? 0;

  if ((params.sessionCountForIpUa ?? 0) >= 12 && !hasHumanSignal) {
    return "suspicious";
  }

  if (hasHumanSignal || interactionCount > 0 || maxScrollDepth > 0 || activeReadSeconds > 0) {
    return "human";
  }

  if (pageStaySeconds <= 3) return "low_quality";
  return "suspicious";
}

export function getOpsRangeWindow(range: OpsRange, now = new Date()) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  if (range === "yesterday") {
    const start = new Date(todayStart);
    start.setDate(start.getDate() - 1);
    return { start, end: todayStart, label: "昨天" };
  }

  if (range === "7d") {
    const start = new Date(todayStart);
    start.setDate(start.getDate() - 6);
    return { start, end: now, label: "最近7天" };
  }

  if (range === "30d") {
    const start = new Date(todayStart);
    start.setDate(start.getDate() - 29);
    return { start, end: now, label: "最近30天" };
  }

  return { start: todayStart, end: now, label: "今天" };
}

export function normalizeOpsRange(value: string | null | undefined): OpsRange {
  if (value === "yesterday" || value === "7d" || value === "30d") return value;
  return "today";
}

export function buildOpsConversionData(
  events: GrowthEventRecord[],
  options: { range: OpsRange; start: Date; end: Date },
): OpsConversionData {
  const sessions = buildSessions(events);
  const ipUaCounts = countSessionsByIpUa(sessions);
  const trafficBySession = new Map<string, TrafficKind>();

  for (const session of sessions) {
    trafficBySession.set(
      session.sessionId,
      classifyTraffic({
        userAgent: session.userAgent,
        eventTypes: session.eventTypes,
        pageStaySeconds: session.pageStaySeconds,
        activeReadSeconds: session.activeReadSeconds,
        interactionCount: session.interactionCount,
        maxScrollDepth: session.maxScrollDepth,
        sessionCountForIpUa: ipUaCounts.get(getIpUaKey(session)) ?? 0,
      }),
    );
  }

  const humanSessions = sessions.filter((session) => trafficBySession.get(session.sessionId) === "human");
  const filteredSessions = sessions.filter((session) => trafficBySession.get(session.sessionId) !== "human");
  const humanSessionIds = new Set(humanSessions.map((session) => session.sessionId));
  const humanEvents = events.filter((event) => humanSessionIds.has(getSessionId(event)));

  const effectiveClicks = countSessionsWithEvents(humanSessions, EFFECTIVE_CLICK_EVENTS);
  const loginAttempts = countSessionsWithEvents(humanSessions, new Set(["signin_view", "google_signin_click"]));
  const successfulLogins = countSessionsWithEvents(humanSessions, new Set(["signup_success"]));
  const createdSearches = countSessionsWithEvents(humanSessions, new Set(["search_create_success"]));
  const leftWithin10Seconds = humanSessions.filter(
    (session) =>
      session.pageStaySeconds <= 10 &&
      session.interactionCount === 0 &&
      session.maxScrollDepth === 0 &&
      !hasAnyEvent(session, EFFECTIVE_CLICK_EVENTS),
  ).length;
  const stayed30Seconds = humanSessions.filter((session) => session.pageStaySeconds >= 30).length;
  const stayed60Seconds = humanSessions.filter((session) => session.pageStaySeconds >= 60).length;
  const stayed180Seconds = humanSessions.filter((session) => session.pageStaySeconds >= 180).length;
  const highInterestNoAction = humanSessions.filter(
    (session) =>
      session.pageStaySeconds >= 60 &&
      !hasAnyEvent(session, new Set(["hero_submit_attempt", "signin_view", "google_signin_click", "search_create_success"])),
  ).length;

  return {
    range: {
      key: options.range,
      label: getOpsRangeWindow(options.range, options.end).label,
      start: options.start.toISOString(),
      end: options.end.toISOString(),
    },
    summary: {
      humanVisits: humanSessions.length,
      filteredVisits: filteredSessions.length,
      suspiciousVisits: filteredSessions.filter((session) => trafficBySession.get(session.sessionId) === "suspicious").length,
      humanRatio: ratio(humanSessions.length, sessions.length),
      effectiveClicks,
      loginAttempts,
      successfulLogins,
      createdSearches,
      medianStaySeconds: median(humanSessions.map((session) => session.pageStaySeconds)),
      averageActiveSeconds: average(humanSessions.map((session) => session.activeReadSeconds)),
      leftWithin10Seconds,
      stayed30Seconds,
      stayed60Seconds,
      stayed180Seconds,
      highInterestNoAction,
    },
    duration: {
      pageStayBuckets: countBuckets(PAGE_STAY_BUCKETS, humanSessions.map((session) => session.pageStaySeconds)),
      activeReadBuckets: countBuckets(ACTIVE_READ_BUCKETS, humanSessions.map((session) => session.activeReadSeconds)),
    },
    funnel: buildFunnel(humanSessions),
    sources: buildSources(humanSessions),
    recentHumanEvents: buildRecentHumanEvents(humanEvents),
    filteredTraffic: buildFilteredTraffic(filteredSessions, trafficBySession),
    diagnosis: buildDiagnosis({
      humanVisits: humanSessions.length,
      effectiveClicks,
      loginAttempts,
      successfulLogins,
      createdSearches,
      stayed30Seconds,
      highInterestNoAction,
    }),
  };
}

function buildSessions(events: GrowthEventRecord[]): SessionSummary[] {
  const sessions = new Map<string, SessionSummary>();

  for (const event of [...events].sort((a, b) => toDate(a.created_at).getTime() - toDate(b.created_at).getTime())) {
    const sessionId = getSessionId(event);
    const eventAt = toDate(event.created_at);
    const metadata = event.metadata ?? {};
    const existing = sessions.get(sessionId);
    const source = normalizeSource(readString(metadata.traffic_source) || readSourceFromUrl(event.page_url) || event.referrer || "direct");

    const session =
      existing ??
      {
        sessionId,
        visitorId: event.visitor_id,
        source,
        userAgent: event.user_agent ?? "",
        ipAddress: event.ip_address,
        firstEventAt: eventAt,
        lastEventAt: eventAt,
        eventTypes: new Set<string>(),
        metadata: {},
        pageStaySeconds: 0,
        activeReadSeconds: 0,
        maxScrollDepth: 0,
        interactionCount: 0,
        sectionViewCount: 0,
      };

    session.lastEventAt = eventAt > session.lastEventAt ? eventAt : session.lastEventAt;
    session.firstEventAt = eventAt < session.firstEventAt ? eventAt : session.firstEventAt;
    session.eventTypes.add(event.event_type);
    session.metadata = { ...session.metadata, ...metadata };
    session.source = source || session.source;
    session.userAgent = event.user_agent ?? session.userAgent;
    session.ipAddress = event.ip_address ?? session.ipAddress;
    session.pageStaySeconds = Math.max(session.pageStaySeconds, readNumber(metadata.page_stay_seconds));
    session.activeReadSeconds = Math.max(session.activeReadSeconds, readNumber(metadata.active_read_seconds));
    session.maxScrollDepth = Math.max(session.maxScrollDepth, readNumber(metadata.max_scroll_depth));
    session.interactionCount = Math.max(session.interactionCount, readNumber(metadata.interaction_count));
    if (event.event_type === "section_view") session.sectionViewCount += 1;

    sessions.set(sessionId, session);
  }

  return [...sessions.values()].map((session) => ({
    ...session,
    pageStaySeconds:
      session.pageStaySeconds > 0
        ? session.pageStaySeconds
        : Math.max(0, Math.round((session.lastEventAt.getTime() - session.firstEventAt.getTime()) / 1000)),
  }));
}

function buildFunnel(humanSessions: SessionSummary[]): FunnelStep[] {
  const steps = [
    { key: "landing", label: "真人访问首页", count: humanSessions.length },
    { key: "start", label: "点击开始", count: countSessionsWithEvents(humanSessions, new Set(["hero_submit_attempt"])) },
    { key: "signin", label: "打开登录", count: countSessionsWithEvents(humanSessions, new Set(["signin_view"])) },
    { key: "login", label: "登录成功", count: countSessionsWithEvents(humanSessions, new Set(["signup_success"])) },
    { key: "new_search", label: "进入新搜索", count: countSessionsWithEvents(humanSessions, new Set(["new_search_view"])) },
    { key: "created", label: "创建搜索", count: countSessionsWithEvents(humanSessions, new Set(["search_create_success"])) },
  ];

  return steps.map((step, index) => ({
    ...step,
    rateFromPrevious: index === 0 ? null : ratio(step.count, steps[index - 1].count),
  }));
}

function buildSources(humanSessions: SessionSummary[]): SourceSummary[] {
  const bySource = new Map<string, SessionSummary[]>();
  for (const session of humanSessions) {
    const source = normalizeSource(session.source);
    bySource.set(source, [...(bySource.get(source) ?? []), session]);
  }

  return [...bySource.entries()]
    .map(([source, sessions]) => ({
      source: sourceLabel(source),
      humanVisits: sessions.length,
      effectiveClicks: countSessionsWithEvents(sessions, EFFECTIVE_CLICK_EVENTS),
      successfulLogins: countSessionsWithEvents(sessions, new Set(["signup_success"])),
      createdSearches: countSessionsWithEvents(sessions, new Set(["search_create_success"])),
      clickRate: ratio(countSessionsWithEvents(sessions, EFFECTIVE_CLICK_EVENTS), sessions.length),
    }))
    .sort((a, b) => b.humanVisits - a.humanVisits)
    .slice(0, 12);
}

function buildRecentHumanEvents(events: GrowthEventRecord[]): RecentHumanEvent[] {
  return [...events]
    .sort((a, b) => toDate(b.created_at).getTime() - toDate(a.created_at).getTime())
    .filter((event) => event.event_type !== "session_summary")
    .slice(0, 50)
    .map((event) => ({
      time: toDate(event.created_at).toISOString(),
      label: eventLabel(event.event_type),
      source: sourceLabel(normalizeSource(readString(event.metadata?.traffic_source) || readSourceFromUrl(event.page_url) || event.referrer || "direct")),
      details: eventDetails(event),
    }));
}

function buildFilteredTraffic(
  filteredSessions: SessionSummary[],
  trafficBySession: Map<string, TrafficKind>,
): FilteredTrafficSummary[] {
  const counts: Record<Exclude<TrafficKind, "human">, number> = {
    bot: 0,
    preview: 0,
    suspicious: 0,
    low_quality: 0,
  };

  for (const session of filteredSessions) {
    const kind = trafficBySession.get(session.sessionId);
    if (kind && kind !== "human") counts[kind] += 1;
  }

  return [
    { kind: "preview", label: "社交预览", count: counts.preview },
    { kind: "bot", label: "爬虫/监控", count: counts.bot },
    { kind: "low_quality", label: "极短无互动", count: counts.low_quality },
    { kind: "suspicious", label: "可疑访问", count: counts.suspicious },
  ];
}

function buildDiagnosis(params: {
  humanVisits: number;
  effectiveClicks: number;
  loginAttempts: number;
  successfulLogins: number;
  createdSearches: number;
  stayed30Seconds: number;
  highInterestNoAction: number;
}) {
  if (params.humanVisits === 0) return "今天还没有真人访问。";
  if (params.effectiveClicks === 0 && params.stayed30Seconds === 0) {
    return `今天有 ${params.humanVisits} 个真人访问，但大多很快离开，优先看首屏表达。`;
  }
  if (params.effectiveClicks === 0) {
    return `今天有 ${params.humanVisits} 个真人访问，${params.stayed30Seconds} 人认真浏览，但还没人点击开始。`;
  }
  if (params.loginAttempts > 0 && params.successfulLogins === 0) {
    return `今天有 ${params.humanVisits} 个真人访问，${params.effectiveClicks} 人点击，主要卡在登录。`;
  }
  if (params.successfulLogins > 0 && params.createdSearches === 0) {
    return `今天有 ${params.successfulLogins} 人登录成功，但还没人创建搜索，主要卡在第一次搜索。`;
  }
  if (params.highInterestNoAction > 0) {
    return `今天有 ${params.humanVisits} 个真人访问，${params.highInterestNoAction} 人停留超过 60 秒但没有行动。`;
  }
  return `今天有 ${params.humanVisits} 个真人访问，${params.effectiveClicks} 人点击开始，${params.createdSearches} 人创建搜索。`;
}

function countBuckets(
  buckets: Array<Omit<DurationBucket, "count"> & { min: number; max: number }>,
  values: number[],
): DurationBucket[] {
  return buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: values.filter((value) => value >= bucket.min && value <= bucket.max).length,
  }));
}

function findBucket(
  buckets: Array<Omit<DurationBucket, "count"> & { min: number; max: number }>,
  seconds: number,
) {
  const normalized = Math.max(0, Math.round(seconds));
  return buckets.find((bucket) => normalized >= bucket.min && normalized <= bucket.max) ?? buckets[0];
}

function countSessionsWithEvents(sessions: SessionSummary[], eventTypes: Set<string>) {
  return sessions.filter((session) => hasAnyEvent(session, eventTypes)).length;
}

function hasAnyEvent(session: SessionSummary, eventTypes: Set<string>) {
  for (const eventType of eventTypes) {
    if (session.eventTypes.has(eventType)) return true;
  }
  return false;
}

function countSessionsByIpUa(sessions: SessionSummary[]) {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const key = getIpUaKey(session);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function getIpUaKey(session: SessionSummary) {
  return `${session.ipAddress ?? "unknown"}|${session.userAgent}`;
}

function getSessionId(event: GrowthEventRecord) {
  return event.session_id || `${event.visitor_id ?? "unknown"}:${event.ip_address ?? "unknown"}:${event.user_agent ?? "unknown"}`;
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }
  return 0;
}

function readSourceFromUrl(pageUrl: string | null) {
  if (!pageUrl) return null;
  try {
    const url = new URL(pageUrl);
    return url.searchParams.get("traffic_source") || url.searchParams.get("utm_source");
  } catch {
    return null;
  }
}

function normalizeSource(value: string) {
  const source = value.toLowerCase();
  if (source.includes("linkedin")) return "linkedin";
  if (source.includes("cold_email") || source === "email" || source.includes("mail")) return "email";
  if (source.includes("google")) return "google";
  if (source.includes("twitter") || source === "x") return "x";
  if (source.includes("reddit")) return "reddit";
  if (source === "direct" || source === "none") return "direct";
  if (source === "referral") return "referral";
  return source.slice(0, 32) || "direct";
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    direct: "直接访问",
    linkedin: "LinkedIn",
    email: "邮件",
    google: "Google",
    google_ads: "Google 广告",
    google_organic: "Google 搜索",
    x: "Twitter/X",
    reddit: "Reddit",
    referral: "其他网站",
  };
  return labels[source] ?? source;
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    page_view: "访问首页",
    engaged_10s: "停留 10 秒",
    engaged_30s: "停留 30 秒",
    engaged_60s: "停留 60 秒",
    engaged_180s: "停留 180 秒",
    section_view: "看到页面模块",
    hero_input_start: "开始输入 JD",
    hero_submit_attempt: "点击开始",
    signin_view: "打开登录",
    google_signin_click: "点击 Google 登录",
    signup_success: "登录成功",
    new_search_view: "进入新搜索页",
    search_create_success: "创建搜索成功",
    search_create_failed: "创建搜索失败",
    sample_view: "查看示例",
    preview_request_click: "点击预览申请",
    preview_request_submit: "提交预览申请",
    book_feedback_click: "点击预约反馈",
    reply_email_click: "点击回复邮件",
  };
  return labels[eventType] ?? eventType;
}

function eventDetails(event: GrowthEventRecord) {
  if (event.event_type === "session_summary") return "";
  const metadata = event.metadata ?? {};
  if (event.event_type === "section_view") {
    const section = readString(metadata.section_id);
    return section ? `模块：${section}` : "";
  }
  if (event.event_type === "hero_input_start") {
    const bucket = readString(metadata.jd_length_bucket);
    return bucket ? `字数：${bucket}` : "已输入";
  }
  if (event.event_type === "hero_submit_attempt") {
    const bucket = readString(metadata.jd_length_bucket);
    return bucket ? `JD：${bucket}` : "";
  }
  if (event.event_type === "search_create_failed") return "创建搜索失败";
  if (event.company) return `公司：${event.company}`;
  return "";
}

function ratio(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

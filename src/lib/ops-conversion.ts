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
  visitorSegments: VisitorSegment[];
  actionItems: ActionItem[];
  topSections: SectionSummary[];
  highIntentSessions: HighIntentSession[];
  recentHumanEvents: RecentHumanEvent[];
  filteredTraffic: FilteredTrafficSummary[];
  ipAttribution: IpAttributionSummary[];
  betaInvites: BetaInviteOpsSummary;
  emailTracking: EmailTrackingRow[];
  operations: OpsOperationsSnapshot;
  diagnosis: string;
};

export type EmailTrackingRow = {
  emailId: string;
  recipient: string;
  company: string;
  sentAt: string | null;
  firstPixelAt: string | null;
  pixelLoads: number;
  signal: "unread" | "image_loaded" | "proxy_or_scanner";
};

export type OpsOperationsSnapshot = {
  generatedAt: string;
  users: {
    total: number;
    newInRange: number;
    activePaid: number;
  };
  searches: {
    created: number;
    completed: number;
    failed: number;
    processing: number;
    successRate: number;
    medianCompletionMinutes: number;
    candidatesDelivered: number;
    averageCandidatesPerCompleted: number;
  };
  billing: {
    completedPayments: number;
    checkoutStarts: number;
    checkoutErrors: number;
    upgradeClicks: number;
    revenue: Array<{ currency: string; amountMinor: number; payments: number }>;
  };
  jobs: {
    searchQueued: number;
    searchRunning: number;
    searchFailed: number;
    evidenceQueued: number;
    evidenceRunning: number;
    evidenceFailed: number;
    stale: number;
  };
  index: {
    totalProfiles: number;
    readyProfiles: number;
    pendingProfiles: number;
    failedProfiles: number;
  };
  searchStatuses: Array<{ status: string; count: number }>;
  recentSearches: Array<{
    id: string;
    title: string;
    status: string;
    candidateCount: number;
    durationMinutes: number | null;
    createdAt: string;
    error: string | null;
  }>;
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
  medianStaySeconds: number;
  averageActiveSeconds: number;
  seriousReaders: number;
  highIntentNoAction: number;
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
  ip: {
    maskedIp: string;
    country: string;
    region: string;
    city: string;
    networkType: IpNetworkType;
    org: string;
    asn: string;
  };
};

export type FilteredTrafficSummary = {
  kind: Exclude<TrafficKind, "human">;
  label: string;
  count: number;
};

export type IpAttributionSummary = IpAttribution & {
  sessions: number;
  humanSessions: number;
  filteredSessions: number;
  lastSeenAt: string;
};

export type VisitorSegment = {
  key: string;
  label: string;
  count: number;
  note: string;
};

export type ActionItem = {
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
};

export type SectionSummary = {
  section: string;
  views: number;
};

export type HighIntentSession = {
  source: string;
  staySeconds: number;
  activeReadSeconds: number;
  maxScrollDepth: number;
  lastEventAt: string;
  lastAction: string;
  reason: string;
};

export type BetaInviteOpsSummary = {
  sent: number;
  opened: number;
  scans: number;
  activated: number;
  searchCreated: number;
  referralSent: number;
  referralActivated: number;
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
  sectionViews: Map<string, number>;
  pageStaySeconds: number;
  activeReadSeconds: number;
  maxScrollDepth: number;
  interactionCount: number;
  sectionViewCount: number;
};

const EFFECTIVE_CLICK_EVENTS = new Set([
  "hero_submit_attempt",
  "google_signin_click",
  "email_otp_requested",
  "preview_request_click",
  "preview_request_submit",
  "book_feedback_click",
  "reply_email_click",
  "upgrade_cta_click",
  "results_unlock_cta_clicked",
  "checkout_start",
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

export function getOpsRangeWindow(range: OpsRange, now = new Date()) {
  const todayStart = getStartOfShanghaiDay(now);

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

function getStartOfShanghaiDay(now: Date) {
  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  return new Date(Math.floor((now.getTime() + shanghaiOffsetMs) / dayMs) * dayMs - shanghaiOffsetMs);
}

export function normalizeOpsRange(value: string | null | undefined): OpsRange {
  if (value === "yesterday" || value === "7d" || value === "30d") return value;
  return "today";
}

export function buildOpsConversionData(
  events: GrowthEventRecord[],
  options: {
    range: OpsRange;
    start: Date;
    end: Date;
    ipAttribution?: Map<string, IpAttribution> | Record<string, IpAttribution>;
    betaInvites?: BetaInviteOpsSummary;
    operations?: OpsOperationsSnapshot;
  },
): OpsConversionData {
  const cleanEvents = removeOrphanSignupEvents(events.filter((event) => !isOpsEvent(event)));
  const emailTracking = buildEmailTracking(events);
  const sessions = buildSessions(cleanEvents);
  const ipUaCounts = countSessionsByIpUa(sessions);
  const ipAttribution = normalizeIpAttribution(options.ipAttribution);
  const trafficBySession = new Map<string, TrafficKind>();

  for (const session of sessions) {
    trafficBySession.set(
      session.sessionId,
      classifyTraffic({
        ipAttribution: session.ipAddress ? ipAttribution.get(session.ipAddress) : null,
        ipAddress: session.ipAddress,
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
  const humanSessionIds = new Set(humanSessions.map((session) => session.sessionId));
  const humanEvents = cleanEvents.filter((event) => humanSessionIds.has(getSessionId(event)));
  const rangeLabel = getOpsRangeWindow(options.range, options.end).label;

  const effectiveClicks = countSessionsWithEvents(humanSessions, EFFECTIVE_CLICK_EVENTS);
  const loginAttempts = countSessionsWithEvents(
    humanSessions,
    new Set(["signin_view", "google_signin_click", "email_otp_requested"]),
  );
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
      !hasAnyEvent(session, new Set(["hero_submit_attempt", "signin_view", "google_signin_click", "email_otp_requested", "search_create_success"])),
  ).length;

  return {
    range: {
      key: options.range,
      label: rangeLabel,
      start: options.start.toISOString(),
      end: options.end.toISOString(),
    },
    summary: {
      humanVisits: humanSessions.length,
      filteredVisits: 0,
      suspiciousVisits: 0,
      humanRatio: humanSessions.length > 0 ? 100 : 0,
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
    visitorSegments: buildVisitorSegments(humanSessions),
    actionItems: buildActionItems({
      humanSessions,
      effectiveClicks,
      loginAttempts,
      successfulLogins,
      createdSearches,
      stayed30Seconds,
      highInterestNoAction,
      leftWithin10Seconds,
      rangeLabel,
    }),
    topSections: buildTopSections(humanSessions),
    highIntentSessions: buildHighIntentSessions(humanSessions),
    recentHumanEvents: buildRecentHumanEvents(humanEvents, ipAttribution),
    filteredTraffic: [],
    ipAttribution: buildIpAttributionSummary(sessions, trafficBySession, ipAttribution),
    betaInvites: options.betaInvites ?? emptyBetaInviteOpsSummary(),
    emailTracking,
    operations: options.operations ?? emptyOpsOperationsSnapshot(options.end),
    diagnosis: buildDiagnosis({
      humanVisits: humanSessions.length,
      effectiveClicks,
      loginAttempts,
      successfulLogins,
      createdSearches,
      stayed30Seconds,
      highInterestNoAction,
      rangeLabel,
    }),
  };
}

export function emptyOpsOperationsSnapshot(now = new Date()): OpsOperationsSnapshot {
  return {
    generatedAt: now.toISOString(),
    users: { total: 0, newInRange: 0, activePaid: 0 },
    searches: {
      created: 0,
      completed: 0,
      failed: 0,
      processing: 0,
      successRate: 0,
      medianCompletionMinutes: 0,
      candidatesDelivered: 0,
      averageCandidatesPerCompleted: 0,
    },
    billing: {
      completedPayments: 0,
      checkoutStarts: 0,
      checkoutErrors: 0,
      upgradeClicks: 0,
      revenue: [],
    },
    jobs: {
      searchQueued: 0,
      searchRunning: 0,
      searchFailed: 0,
      evidenceQueued: 0,
      evidenceRunning: 0,
      evidenceFailed: 0,
      stale: 0,
    },
    index: { totalProfiles: 0, readyProfiles: 0, pendingProfiles: 0, failedProfiles: 0 },
    searchStatuses: [],
    recentSearches: [],
  };
}

export function emptyBetaInviteOpsSummary(): BetaInviteOpsSummary {
  return {
    sent: 0,
    opened: 0,
    scans: 0,
    activated: 0,
    searchCreated: 0,
    referralSent: 0,
    referralActivated: 0,
  };
}

function normalizeIpAttribution(value: Map<string, IpAttribution> | Record<string, IpAttribution> | undefined) {
  if (!value) return new Map<string, IpAttribution>();
  if (value instanceof Map) return value;
  return new Map(Object.entries(value));
}

function removeOrphanSignupEvents(events: GrowthEventRecord[]) {
  const eventsBySession = new Map<string, GrowthEventRecord[]>();
  for (const event of events) {
    const sessionId = getSessionId(event);
    const list = eventsBySession.get(sessionId) ?? [];
    list.push(event);
    eventsBySession.set(sessionId, list);
  }

  return events.filter((event) => {
    if (event.event_type !== "signup_success") return true;
    const sessionEvents = eventsBySession.get(getSessionId(event)) ?? [];
    return sessionEvents.some((sessionEvent) =>
      sessionEvent.event_type === "google_signin_click" ||
      sessionEvent.event_type === "email_otp_requested" ||
      sessionEvent.event_type === "email_otp_verified"
    );
  });
}

function isOpsEvent(event: GrowthEventRecord) {
  if (event.event_type === "email_sent" || event.event_type === "email_image_loaded") return true;
  const route = readString(event.metadata?.route);
  if (route?.startsWith("/ops/")) return true;
  if (!event.page_url) return false;
  try {
    return new URL(event.page_url).pathname.startsWith("/ops/");
  } catch {
    return event.page_url.includes("/ops/");
  }
}

function buildEmailTracking(events: GrowthEventRecord[]): EmailTrackingRow[] {
  const byEmail = new Map<string, EmailTrackingRow>();
  for (const event of events) {
    if (!event.email_id || (event.event_type !== "email_sent" && event.event_type !== "email_image_loaded")) continue;
    const existing = byEmail.get(event.email_id) ?? {
      emailId: event.email_id,
      recipient: event.recipient ?? "",
      company: event.company ?? "",
      sentAt: null,
      firstPixelAt: null,
      pixelLoads: 0,
      signal: "unread" as const,
    };
    if (event.recipient) existing.recipient = event.recipient;
    if (event.company) existing.company = event.company;
    const at = toDate(event.created_at).toISOString();
    if (event.event_type === "email_sent") {
      existing.sentAt = existing.sentAt && existing.sentAt < at ? existing.sentAt : at;
    } else {
      existing.pixelLoads += 1;
      existing.firstPixelAt = existing.firstPixelAt && existing.firstPixelAt < at ? existing.firstPixelAt : at;
      const requestClass = readString(event.metadata?.request_class);
      existing.signal = requestClass === "image_proxy" || requestClass === "security_scanner"
        ? "proxy_or_scanner"
        : "image_loaded";
    }
    byEmail.set(event.email_id, existing);
  }
  return [...byEmail.values()].sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));
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
        sectionViews: new Map<string, number>(),
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
    if (event.event_type === "section_view") {
      session.sectionViewCount += 1;
      const sectionId = readString(metadata.section_id);
      if (sectionId) {
        session.sectionViews.set(sectionId, (session.sectionViews.get(sectionId) ?? 0) + 1);
      }
    }

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
    { key: "signin", label: "打开登录", count: countSessionsWithEvents(humanSessions, new Set(["signin_view", "google_signin_click", "email_otp_requested"])) },
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
      medianStaySeconds: median(sessions.map((session) => session.pageStaySeconds)),
      averageActiveSeconds: average(sessions.map((session) => session.activeReadSeconds)),
      seriousReaders: sessions.filter(isSeriousReader).length,
      highIntentNoAction: sessions.filter(isHighIntentNoAction).length,
      effectiveClicks: countSessionsWithEvents(sessions, EFFECTIVE_CLICK_EVENTS),
      successfulLogins: countSessionsWithEvents(sessions, new Set(["signup_success"])),
      createdSearches: countSessionsWithEvents(sessions, new Set(["search_create_success"])),
      clickRate: ratio(countSessionsWithEvents(sessions, EFFECTIVE_CLICK_EVENTS), sessions.length),
    }))
    .sort((a, b) => b.humanVisits - a.humanVisits)
    .slice(0, 12);
}

function buildVisitorSegments(humanSessions: SessionSummary[]): VisitorSegment[] {
  const quickLeave = humanSessions.filter(
    (session) =>
      session.pageStaySeconds <= 10 &&
      session.interactionCount === 0 &&
      session.maxScrollDepth === 0 &&
      !hasAnyEvent(session, EFFECTIVE_CLICK_EVENTS),
  ).length;
  const skimmed = humanSessions.filter(
    (session) =>
      session.pageStaySeconds > 10 &&
      session.pageStaySeconds < 30 &&
      !hasAnyEvent(session, EFFECTIVE_CLICK_EVENTS),
  ).length;
  const seriousNoAction = humanSessions.filter(isHighIntentNoAction).length;
  const clickedNoLogin = humanSessions.filter(
    (session) =>
        hasAnyEvent(session, new Set(["hero_submit_attempt", "signin_view", "google_signin_click", "email_otp_requested"])) &&
      !session.eventTypes.has("signup_success"),
  ).length;
  const productNoSearch = humanSessions.filter(
    (session) =>
      session.eventTypes.has("signup_success") &&
      !session.eventTypes.has("search_create_success"),
  ).length;
  const createdSearch = humanSessions.filter((session) => session.eventTypes.has("search_create_success")).length;

  return [
    {
      key: "quick_leave",
      label: "很快离开",
      count: quickLeave,
      note: "10 秒内离开，且没有滚动或点击",
    },
    {
      key: "skimmed",
      label: "浅看未行动",
      count: skimmed,
      note: "看了 11-29 秒，但没有点击",
    },
    {
      key: "serious_no_action",
      label: "认真看但没点",
      count: seriousNoAction,
      note: "停留 60 秒以上，但没有点击开始或登录",
    },
    {
      key: "clicked_no_login",
      label: "点了但没登录",
      count: clickedNoLogin,
      note: "点击开始或登录，但没有成功登录",
    },
    {
      key: "product_no_search",
      label: "登录后没搜索",
      count: productNoSearch,
      note: "登录成功，但没有创建第一次搜索",
    },
    {
      key: "created_search",
      label: "创建搜索",
      count: createdSearch,
      note: "已经走到第一次搜索",
    },
  ];
}

function buildActionItems(params: {
  humanSessions: SessionSummary[];
  effectiveClicks: number;
  loginAttempts: number;
  successfulLogins: number;
  createdSearches: number;
  stayed30Seconds: number;
  highInterestNoAction: number;
  leftWithin10Seconds: number;
  rangeLabel: string;
}): ActionItem[] {
  const items: ActionItem[] = [];
  const humanVisits = params.humanSessions.length;
  const clickedNoLogin = params.humanSessions.filter(
    (session) =>
      hasAnyEvent(session, new Set(["hero_submit_attempt", "signin_view", "google_signin_click", "email_otp_requested"])) &&
      !session.eventTypes.has("signup_success"),
  ).length;
  const productNoSearch = params.humanSessions.filter(
    (session) =>
      session.eventTypes.has("signup_success") &&
      !session.eventTypes.has("search_create_success"),
  ).length;

  if (humanVisits === 0) {
    items.push({
      priority: "high",
      title: "先看流量入口",
      detail: `${params.rangeLabel}没有真人访问。优先检查这段时间发出去的链接、LinkedIn 私信或邮件是否真的带了站点链接。`,
    });
  }

  if (humanVisits > 0 && params.leftWithin10Seconds / humanVisits >= 0.5) {
    items.push({
      priority: "high",
      title: "首屏可能没抓住人",
      detail: `${params.leftWithin10Seconds}/${humanVisits} 个真人 10 秒内离开。优先检查首屏标题、按钮和移动端首屏。`,
    });
  }

  if (params.highInterestNoAction > 0) {
    items.push({
      priority: "medium",
      title: "有人认真看了但没行动",
      detail: `${params.highInterestNoAction} 个访客停留超过 60 秒但没有点击。优先加强按钮文案、示例可信度或降低登录前摩擦。`,
    });
  }

  if (clickedNoLogin > 0) {
    items.push({
      priority: "high",
      title: "登录是当前阻力",
      detail: `${clickedNoLogin} 个访客点击开始/登录但没有成功登录。优先检查 Google 登录、弹窗文案和跳转。`,
    });
  }

  if (productNoSearch > 0) {
    items.push({
      priority: "high",
      title: "第一次搜索没有发生",
      detail: `${productNoSearch} 个访客登录后没有创建搜索。优先检查新搜索页首屏、JD 输入门槛和创建失败。`,
    });
  }

  if (params.successfulLogins > 0 && params.createdSearches === 0) {
    items.push({
      priority: "high",
      title: "产品内激活卡住",
      detail: "已经有人登录成功，但没有人创建搜索。最值得看新搜索页和真实创建链路。",
    });
  }

  if (items.length === 0) {
    items.push({
      priority: "low",
      title: `${params.rangeLabel}暂时没有明显异常`,
      detail: "继续看来源质量、停留秒数和是否有人走到第一次搜索。",
    });
  }

  return items.slice(0, 5);
}

function buildTopSections(humanSessions: SessionSummary[]): SectionSummary[] {
  const counts = new Map<string, number>();
  for (const session of humanSessions) {
    for (const section of session.sectionViews.keys()) {
      counts.set(section, (counts.get(section) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([section, views]) => ({ section, views }))
    .sort((left, right) => right.views - left.views)
    .slice(0, 8);
}

function buildHighIntentSessions(humanSessions: SessionSummary[]): HighIntentSession[] {
  return humanSessions
    .filter(
      (session) =>
        isHighIntentNoAction(session) ||
        session.eventTypes.has("hero_input_start") ||
        session.eventTypes.has("hero_submit_attempt") ||
        session.eventTypes.has("google_signin_click") ||
        session.eventTypes.has("email_otp_requested") ||
        session.eventTypes.has("search_create_success"),
    )
    .sort((left, right) => right.lastEventAt.getTime() - left.lastEventAt.getTime())
    .slice(0, 8)
    .map((session) => ({
      source: sourceLabel(normalizeSource(session.source)),
      staySeconds: session.pageStaySeconds,
      activeReadSeconds: session.activeReadSeconds,
      maxScrollDepth: session.maxScrollDepth,
      lastEventAt: session.lastEventAt.toISOString(),
      lastAction: lastMeaningfulAction(session),
      reason: highIntentReason(session),
    }));
}

function buildRecentHumanEvents(
  events: GrowthEventRecord[],
  ipAttribution: Map<string, IpAttribution>,
): RecentHumanEvent[] {
  return [...events]
    .sort((a, b) => toDate(b.created_at).getTime() - toDate(a.created_at).getTime())
    .filter((event) => event.event_type !== "session_summary")
    .slice(0, 50)
    .map((event) => {
      const attribution = event.ip_address
        ? ipAttribution.get(event.ip_address) ?? fallbackIpAttribution(event.ip_address)
        : fallbackIpAttribution(null);
      return {
        time: toDate(event.created_at).toISOString(),
        label: eventLabel(event.event_type),
        source: sourceLabel(normalizeSource(readString(event.metadata?.traffic_source) || readSourceFromUrl(event.page_url) || event.referrer || "direct")),
        details: eventDetails(event),
        ip: {
          maskedIp: attribution.maskedIp,
          country: attribution.country,
          region: attribution.region,
          city: attribution.city,
          networkType: attribution.networkType,
          org: attribution.org,
          asn: attribution.asn,
        },
      };
    });
}

function buildIpAttributionSummary(
  sessions: SessionSummary[],
  trafficBySession: Map<string, TrafficKind>,
  ipAttribution: Map<string, IpAttribution>,
): IpAttributionSummary[] {
  const byIp = new Map<string, SessionSummary[]>();
  for (const session of sessions.filter((item) => trafficBySession.get(item.sessionId) === "human")) {
    const ipAddress = session.ipAddress || "unknown";
    byIp.set(ipAddress, [...(byIp.get(ipAddress) ?? []), session]);
  }

  return [...byIp.entries()]
    .map(([ipAddress, ipSessions]) => {
      const attribution = ipAttribution.get(ipAddress) ?? fallbackIpAttribution(ipAddress);
      return {
        ...attribution,
        sessions: ipSessions.length,
        humanSessions: ipSessions.length,
        filteredSessions: 0,
        lastSeenAt: new Date(Math.max(...ipSessions.map((session) => session.lastEventAt.getTime()))).toISOString(),
      };
    })
    .sort((left, right) => {
      if (left.networkType !== right.networkType) {
        return left.networkType === "data_center" ? -1 : right.networkType === "data_center" ? 1 : 0;
      }
      return right.sessions - left.sessions;
    });
}

function fallbackIpAttribution(ipAddress: string | null | undefined): IpAttribution {
  return {
    ipAddress: ipAddress || "unknown",
    maskedIp: maskIp(ipAddress),
    country: "未知",
    region: "",
    city: "",
    networkType: isCloudOrSecurityIp(ipAddress) ? "data_center" : "unknown",
    org: "",
    asn: "",
  };
}

export function maskIp(ipAddress: string | null | undefined) {
  if (!ipAddress) return "未知";
  const ipv4Parts = ipAddress.split(".");
  if (ipv4Parts.length === 4) return `${ipv4Parts[0]}.${ipv4Parts[1]}.${ipv4Parts[2]}.*`;

  const ipv6Parts = ipAddress.split(":").filter(Boolean);
  if (ipv6Parts.length > 0) return `${ipv6Parts.slice(0, 3).join(":")}:*`;
  return "未知";
}

function buildDiagnosis(params: {
  humanVisits: number;
  effectiveClicks: number;
  loginAttempts: number;
  successfulLogins: number;
  createdSearches: number;
  stayed30Seconds: number;
  highInterestNoAction: number;
  rangeLabel: string;
}) {
  if (params.humanVisits === 0) return `${params.rangeLabel}还没有真人访问。`;
  if (params.effectiveClicks === 0 && params.stayed30Seconds === 0) {
    return `${params.rangeLabel}有 ${params.humanVisits} 个真人访问，但大多很快离开，优先看首屏表达。`;
  }
  if (params.effectiveClicks === 0) {
    return `${params.rangeLabel}有 ${params.humanVisits} 个真人访问，${params.stayed30Seconds} 人认真浏览，但还没人点击开始。`;
  }
  if (params.loginAttempts > 0 && params.successfulLogins === 0) {
    return `${params.rangeLabel}有 ${params.humanVisits} 个真人访问，${params.effectiveClicks} 人点击，主要卡在登录。`;
  }
  if (params.successfulLogins > 0 && params.createdSearches === 0) {
    return `${params.rangeLabel}有 ${params.successfulLogins} 人登录成功，但还没人创建搜索，主要卡在第一次搜索。`;
  }
  if (params.highInterestNoAction > 0) {
    return `${params.rangeLabel}有 ${params.humanVisits} 个真人访问，${params.highInterestNoAction} 人停留超过 60 秒但没有行动。`;
  }
  return `${params.rangeLabel}有 ${params.humanVisits} 个真人访问，${params.effectiveClicks} 人点击开始，${params.createdSearches} 人创建搜索。`;
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

function isSeriousReader(session: SessionSummary) {
  return session.pageStaySeconds >= 30 && (session.maxScrollDepth > 0 || session.sectionViewCount > 0);
}

function isHighIntentNoAction(session: SessionSummary) {
  return (
    session.pageStaySeconds >= 60 &&
    !hasAnyEvent(session, new Set(["hero_submit_attempt", "signin_view", "google_signin_click", "email_otp_requested", "search_create_success"]))
  );
}

function lastMeaningfulAction(session: SessionSummary) {
  const priority = [
    "search_create_success",
    "search_create_failed",
    "signup_success",
    "google_signin_click",
    "email_otp_requested",
    "signin_view",
    "hero_submit_attempt",
    "hero_input_start",
    "sample_view",
    "section_view",
    "engaged_180s",
    "engaged_60s",
    "engaged_30s",
    "engaged_10s",
    "page_view",
  ];
  return eventLabel(priority.find((eventType) => session.eventTypes.has(eventType)) ?? "page_view");
}

function highIntentReason(session: SessionSummary) {
  if (session.eventTypes.has("search_create_success")) return "已创建搜索";
  if (session.eventTypes.has("search_create_failed")) return "创建搜索失败";
  if (session.eventTypes.has("google_signin_click") && !session.eventTypes.has("signup_success")) return "点了登录但没成功";
  if (session.eventTypes.has("email_otp_requested") && !session.eventTypes.has("signup_success")) return "请求邮箱验证码但没登录";
  if (session.eventTypes.has("hero_submit_attempt")) return "点击开始";
  if (session.eventTypes.has("hero_input_start")) return "输入了 JD";
  if (isHighIntentNoAction(session)) return "停留超过 60 秒但没行动";
  return "有明显兴趣";
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
    email_otp_requested: "请求邮箱验证码",
    email_otp_verified: "邮箱验证码登录",
    signup_success: "登录成功",
    new_search_view: "进入新搜索页",
    search_create_success: "创建搜索成功",
    search_create_failed: "创建搜索失败",
    sample_view: "查看示例",
    preview_request_click: "点击预览申请",
    preview_request_submit: "提交预览申请",
    book_feedback_click: "点击预约反馈",
    reply_email_click: "点击回复邮件",
    search_processing_view: "查看搜索进度",
    search_results_view: "查看搜索结果",
    results_summary_view: "查看交付摘要",
    search_done: "搜索完成",
    candidate_expand: "展开候选人",
    upgrade_cta_click: "点击升级",
    upgrade_value_exposed: "看到付费价值",
    results_unlock_cta_viewed: "看到解锁入口",
    results_unlock_cta_clicked: "点击解锁结果",
    contact_unlock_gate_view: "看到联系人解锁",
    client_brief_gate_view: "看到客户简报解锁",
    pricing_plan_select: "选择价格方案",
    checkout_start: "打开结账",
    checkout_success: "结账返回成功页",
    checkout_error: "结账错误",
    retry_search_click: "重试搜索",
    plan_status_card_click: "点击套餐状态",
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
  if (event.event_type === "search_results_view" || event.event_type === "results_summary_view") {
    const count = readNumber(metadata.candidate_count);
    return count > 0 ? `${count} 位候选人` : "";
  }
  if (event.event_type === "candidate_expand") {
    const rank = readNumber(metadata.final_rank);
    return rank > 0 ? `第 ${rank} 名` : "";
  }
  if (event.event_type.startsWith("checkout_")) {
    const purchaseType = readString(metadata.purchase_type);
    return purchaseType ? `方案：${purchaseType}` : "";
  }
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

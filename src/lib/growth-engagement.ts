export const ENGAGEMENT_EVENT_THRESHOLDS = {
  engaged_10s: 10,
  engaged_30s: 30,
  engaged_60s: 60,
  engaged_180s: 180,
} as const;

export type EngagementEventType = keyof typeof ENGAGEMENT_EVENT_THRESHOLDS;

export function getEngagementThreshold(eventType: string) {
  return ENGAGEMENT_EVENT_THRESHOLDS[eventType as EngagementEventType] ?? null;
}

export function hasReachedEngagementThreshold(params: {
  eventType: string;
  activeReadSeconds: number;
  pageStaySeconds: number;
}) {
  const threshold = getEngagementThreshold(params.eventType);
  if (threshold === null) return true;

  return params.activeReadSeconds >= threshold && params.pageStaySeconds >= threshold;
}

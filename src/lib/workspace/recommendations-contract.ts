import type { Deliverable, Role, SourceRecord } from "./types";
export type RecommendationEvent = {
  id: string;
  document_id: string;
  version: number;
  channel: string;
  status: string;
  at: string;
  recipient: string;
  note: string;
  person_ids: string[];
  snapshot: {
    title: string;
    content: string;
    people?: Array<{ id: string; name: string; headline?: string }>;
    files?: Array<{ id: string; name: string }>;
  };
};
export type RecommendationRole = {
  role: Role;
  materials: Deliverable[];
  events: RecommendationEvent[];
  feedback: SourceRecord[];
  people: Array<{ id: string; name: string; headline: string }>;
  recommended_count: number;
  last_delivery: string | null;
};
export type RecommendationWorkspace = { roles: RecommendationRole[] };
export function wasDelivered(event: RecommendationEvent) {
  return event.status === "sent" || event.status === "recorded";
}

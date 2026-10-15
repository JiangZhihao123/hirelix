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

export function pageRecommendations(
  workspace: RecommendationWorkspace,
  input: import("zod").infer<
    typeof import("./list-options").recommendationListOptions
  >,
) {
  const query = input.q.toLocaleLowerCase();
  const roles = workspace.roles.filter(
    (item) =>
      [
        item.role.title,
        item.role.client_name,
        ...item.people.map((p) => p.name),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query) &&
      (input.filter !== "recommended" || item.recommended_count > 0) &&
      (input.filter !== "preparing" || item.recommended_count === 0),
  );
  const value = (item: RecommendationRole): string | number | null => {
    if (input.sort === "count") return item.recommended_count;
    if (input.sort === "title") return item.role.title.toLocaleLowerCase();
    const date =
      input.sort === "delivery"
        ? item.last_delivery
        : item.feedback[0]?.occurred_at || item.feedback[0]?.created_at;
    return date ? new Date(date).getTime() : null;
  };
  roles.sort((a, b) => {
    const av = value(a),
      bv = value(b);
    if (av === null || bv === null)
      return av === bv
        ? a.role.id.localeCompare(b.role.id)
        : av === null
          ? 1
          : -1;
    const compared =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return (
      (input.direction === "asc" ? compared : -compared) ||
      a.role.id.localeCompare(b.role.id)
    );
  });
  return {
    roles: roles.slice((input.page - 1) * 50, input.page * 50),
    total: roles.length,
    page: input.page,
    page_size: 50,
  };
}

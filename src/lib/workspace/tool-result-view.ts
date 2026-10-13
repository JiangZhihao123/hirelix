import type { TurnPart } from "./turn-progress";

type ToolPart = Extract<TurnPart, {type: "tool"}>;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : undefined;

// Only the fields needed to inspect a returned list reach the conversation UI.
// Full profiles, private notes, embeddings and tool inputs remain server-side.
export function toolResultList(name: string, result: Record<string, unknown>): ToolPart["list"] {
  const kind = ({list_roles: "roles", find_roles: "roles", list_candidates: "people", find_candidates: "people", list_reminders: "reminders"} as Record<string, string>)[name];
  if (!kind) return;
  const entries = result[kind] ?? (kind === "people" ? result.matches : undefined);
  if (!Array.isArray(entries)) return;
  return {
    returned: typeof result.returned === "number" ? result.returned : entries.length,
    ...(typeof result.total === "number" ? {total: result.total} : {}),
    has_more: result.has_more === true,
    items: entries.flatMap(value => {
      const entry = object(value), person = object(entry.person);
      const title = text(entry.title) || text(entry.name) || text(person.name);
      if (!title) return [];
      const href = text(entry.href) || text(entry.source_href);
      return [{title, detail: text(entry.client_name) || text(entry.headline) || text(person.headline),
        ...(href?.startsWith("/app/") ? {href} : {}),
      }];
    }),
  };
}

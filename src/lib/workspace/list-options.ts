import { z } from "zod";
export const listOptions = z.object({
  q: z.string().trim().max(1000).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export const roleListOptions = listOptions.extend({
  status: z.enum(["all", "active", "paused", "closed"]).default("all"),
  sort: z
    .enum(["updated", "created", "title", "client", "candidates"])
    .default("updated"),
});
export const recommendationListOptions = listOptions.extend({
  filter: z.enum(["all", "recommended", "preparing"]).default("all"),
  sort: z.enum(["delivery", "feedback", "title", "count"]).default("delivery"),
});

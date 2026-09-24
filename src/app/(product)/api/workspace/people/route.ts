import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { listPeople, createPerson } from "@/lib/workspace/people";
const filters = z.object({
  q: z.string().max(1000).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  location: z.string().max(250).default(""),
  expertise: z.string().max(100).default(""),
});
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    const input = filters.parse(Object.fromEntries(req.nextUrl.searchParams));
    return listPeople(
      user.id,
      input.q,
      input.page,
      input.location,
      input.expertise,
    );
  });
}
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => ({
    person: await createPerson(user.id, await readBody(req)),
  }));
}

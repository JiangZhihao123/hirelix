import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getUserFromApiRequest, type ApiAuthUser } from "@/lib/api-auth";
import { getLogger } from "@/lib/logger";
import { WorkspaceError } from "./database";

const logger = getLogger({ component: "private_workspace_api" });
export async function workspaceApi(
  req: NextRequest,
  handler: (user: ApiAuthUser) => Promise<unknown>,
) {
  const user = await getUserFromApiRequest(req);
  if (!user)
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  try {
    const result = await handler(user);
    return result instanceof Response ? result : NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (error instanceof WorkspaceError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    logger.error(
      {
        user_id: user.id,
        error_type: error instanceof Error ? error.name : "Unknown",
      },
      "Workspace request failed",
    );
    return NextResponse.json(
      {
        error:
          "We could not complete this request. Your saved work is still available.",
      },
      { status: 500 },
    );
  }
}
export async function readBody(req: NextRequest) {
  try {
    return (await req.json()) as unknown;
  } catch {
    throw new WorkspaceError("Send a valid JSON request");
  }
}

import { NextResponse, connection } from "next/server";
import type { ZodType } from "zod";
import { ApiError, describeError } from "./errors";
import { guardRequest } from "./guard";

export { ApiError } from "./errors";

/** Parse and validate a JSON body. */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Request body is not valid JSON");
  }
  return schema.parse(raw);
}

export function created<T>(body: T) {
  return NextResponse.json(body, { status: 201 });
}

/**
 * Wraps a route handler with the request guard and uniform error handling.
 * Handlers return plain data (sent as JSON) or a Response.
 */
export function route<Ctx = unknown>(handler: (req: Request, ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      // Every route is per-request: never prerender or cache API responses.
      await connection();
      guardRequest(req);
      const result = await handler(req, ctx);
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (error) {
      const { status, body } = describeError(error);
      return NextResponse.json(body, { status });
    }
  };
}

export type IdParams = { params: Promise<{ id: string }> };

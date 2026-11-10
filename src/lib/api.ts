import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/** An error that is safe to show to the caller. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostnameOf(host: string): string {
  // "[::1]:3000" -> "[::1]", "localhost:3000" -> "localhost"
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
  const i = host.lastIndexOf(":");
  return i === -1 ? host : host.slice(0, i);
}

export function isAllowedHost(host: string | null, allowList = process.env.ALLOWED_HOSTS): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  if (LOOPBACK_HOSTNAMES.has(hostnameOf(h))) return true;
  const extra = (allowList ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return extra.some((entry) => entry === h || entry === hostnameOf(h));
}

/**
 * Request guard for an app with no authentication yet:
 *  - Host must be loopback or explicitly allow-listed (blocks DNS rebinding).
 *  - Writes must come from this origin (blocks cross-site form/fetch posts).
 *  - Bodies must be declared as JSON (a cross-site "simple request" cannot do that
 *    without a CORS preflight, which we never approve).
 */
export function guardRequest(req: Request): void {
  const host = req.headers.get("host");
  if (!isAllowedHost(host)) {
    throw new ApiError(403, "Host not allowed");
  }

  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return;

  const origin = req.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      throw new ApiError(403, "Cross-origin request refused");
    }
    if (originHost !== host!.toLowerCase()) {
      throw new ApiError(403, "Cross-origin request refused");
    }
  }
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ApiError(403, "Cross-origin request refused");
  }

  if (method !== "DELETE") {
    const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("application/json")) {
      throw new ApiError(415, "Content-Type must be application/json");
    }
  }
}

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

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, ...(error.details ? { details: error.details } : {}) },
      { status: error.status }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid input",
        issues: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      { status: 400 }
    );
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (code === "P2002") return NextResponse.json({ error: "Already exists" }, { status: 409 });
  if (code === "P2003") {
    return NextResponse.json({ error: "A referenced record does not exist" }, { status: 400 });
  }
  // Anything else is ours: log it, tell the caller nothing about internals.
  console.error("Unhandled API error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/**
 * Wraps a route handler with the request guard and uniform error handling.
 * Handlers return plain data (sent as JSON) or a Response.
 */
export function route<Ctx = unknown>(
  handler: (req: Request, ctx: Ctx) => Promise<unknown>
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      guardRequest(req);
      const result = await handler(req, ctx);
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export type IdParams = { params: Promise<{ id: string }> };

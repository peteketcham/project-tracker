import { ZodError } from "zod";

/** An error whose message is safe to show to the caller (REST or MCP). */
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

export const notFound = (what: string) => new ApiError(404, `${what} not found`);
export const conflict = (message: string) => new ApiError(409, message);

/** Turns any thrown value into a message that is safe to show, plus a status. */
export function describeError(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: { error: error.message, ...(error.details ? { details: error.details } : {}) },
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: "Invalid input",
        issues: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P2025") return { status: 404, body: { error: "Not found" } };
  if (code === "P2002") return { status: 409, body: { error: "Already exists" } };
  if (code === "P2003") {
    return { status: 400, body: { error: "A referenced record does not exist" } };
  }
  // Anything else is ours: log it, tell the caller nothing about internals.
  console.error("Unhandled error:", error);
  return { status: 500, body: { error: "Internal server error" } };
}

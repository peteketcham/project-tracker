import { ApiError } from "./errors";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostnameOf(host: string): string {
  // "[::1]:3000" -> "[::1]", "localhost:3000" -> "localhost"
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
  const i = host.lastIndexOf(":");
  return i === -1 ? host : host.slice(0, i);
}

export function isAllowedHost(
  host: string | null,
  allowList: string | undefined = process.env.ALLOWED_HOSTS
): boolean {
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
export function guardRequest(req: Request, allowList?: string): void {
  const host = req.headers.get("host");
  if (!host || !isAllowedHost(host, allowList)) {
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
    if (originHost !== host.toLowerCase()) {
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

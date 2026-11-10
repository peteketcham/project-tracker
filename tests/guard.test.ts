import { test } from "node:test";
import assert from "node:assert/strict";
import { guardRequest, isAllowedHost } from "../src/lib/guard";
import { ApiError, describeError } from "../src/lib/errors";

function req(method: string, headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/tasks", { method, headers });
}
function statusOf(fn: () => void): number {
  try {
    fn();
    return 200;
  } catch (e) {
    return e instanceof ApiError ? e.status : 500;
  }
}

test("loopback hosts are allowed, others only when allow-listed", () => {
  assert.equal(isAllowedHost("localhost:3000", ""), true);
  assert.equal(isAllowedHost("127.0.0.1:3000", ""), true);
  assert.equal(isAllowedHost("[::1]:3000", ""), true);
  assert.equal(isAllowedHost("evil.example:3000", ""), false);
  assert.equal(isAllowedHost("localhost.evil.example", ""), false);
  assert.equal(isAllowedHost(null, ""), false);
  assert.equal(isAllowedHost("tracker.lan:3000", "tracker.lan"), true);
  assert.equal(isAllowedHost("tracker.lan:3000", "tracker.lan:8080"), false);
});

test("a rebinding request with a foreign Host is refused even for reads", () => {
  assert.equal(statusOf(() => guardRequest(req("GET", { host: "attacker.example" }), "")), 403);
  assert.equal(statusOf(() => guardRequest(req("GET", { host: "localhost:3000" }), "")), 200);
});

test("cross-origin writes are refused", () => {
  const json = { host: "localhost:3000", "content-type": "application/json" };
  assert.equal(statusOf(() => guardRequest(req("POST", json), "")), 200);
  assert.equal(
    statusOf(() => guardRequest(req("POST", { ...json, origin: "http://localhost:3000" }), "")),
    200
  );
  assert.equal(
    statusOf(() => guardRequest(req("POST", { ...json, origin: "https://evil.example" }), "")),
    403
  );
  assert.equal(
    statusOf(() => guardRequest(req("DELETE", { host: "localhost:3000", "sec-fetch-site": "cross-site" }), "")),
    403
  );
});

test("a cross-site 'simple' POST (text/plain body) is refused", () => {
  assert.equal(
    statusOf(() =>
      guardRequest(req("POST", { host: "localhost:3000", "content-type": "text/plain" }), "")
    ),
    415
  );
});

test("unexpected errors never leak their message", () => {
  const original = console.error;
  console.error = () => {};
  try {
    const { status, body } = describeError(new Error("SQLITE_CONSTRAINT: secret table details"));
    assert.equal(status, 500);
    assert.deepEqual(body, { error: "Internal server error" });
  } finally {
    console.error = original;
  }
  assert.equal(describeError(new ApiError(409, "Nope")).status, 409);
  assert.equal(describeError({ code: "P2025" }).status, 404);
});

import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/readyz/route.ts";

test("public readiness exposes only a bounded ready state", async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), { status: "ready" });
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GET } from "../app/api/readyz/route.ts";

test("public readiness exposes only a bounded ready state", async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), { status: "ready" });
});

test("production build is configured directly for Cloudflare", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.doesNotMatch(read("vite.config.ts"), /@openai\/sites|sites\(\)|\.openai\/hosting/);
  const packageManifest = JSON.parse(read("package.json"));
  assert.equal(packageManifest.name, "pixelforge-photo-editor");
  assert.equal(packageManifest.devDependencies["@openai/sites-vite-plugin"], undefined);
  const config = JSON.parse(read("wrangler.jsonc"));
  assert.equal(config.name, "pixelforge-photo-editor");
  assert.equal(config.assets.binding, "ASSETS");
  assert.equal(config.observability.enabled, true);
});

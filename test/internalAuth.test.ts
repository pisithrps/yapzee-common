import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { checkInternalKey, requireInternalKey } from "../src/internalAuth.js";

const ENV_KEY = "INTERNAL_API_KEY";
const originalKey = process.env[ENV_KEY];

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalKey;
  }
});

describe("checkInternalKey (pure)", () => {
  test("missing env raises 500", () => {
    delete process.env[ENV_KEY];
    expect(checkInternalKey("anything")).toEqual({ ok: false, status: 500 });
  });

  test("mismatched header raises 403", () => {
    process.env[ENV_KEY] = "secret";
    expect(checkInternalKey("wrong")).toEqual({ ok: false, status: 403 });
  });

  test("missing header raises 403", () => {
    process.env[ENV_KEY] = "secret";
    expect(checkInternalKey(null)).toEqual({ ok: false, status: 403 });
  });

  test("matching header passes", () => {
    process.env[ENV_KEY] = "secret";
    expect(checkInternalKey("secret")).toEqual({ ok: true });
  });
});

describe("requireInternalKey (Hono middleware)", () => {
  const app = new Hono();
  app.use("/internal", requireInternalKey);
  app.get("/internal", (c) => c.text("ok"));

  test("missing env -> 500", async () => {
    delete process.env[ENV_KEY];
    const res = await app.request("/internal", { headers: { "X-Internal-Key": "anything" } });
    expect(res.status).toBe(500);
  });

  test("mismatched header -> 403", async () => {
    process.env[ENV_KEY] = "secret";
    const res = await app.request("/internal", { headers: { "X-Internal-Key": "wrong" } });
    expect(res.status).toBe(403);
  });

  test("missing header -> 403", async () => {
    process.env[ENV_KEY] = "secret";
    const res = await app.request("/internal");
    expect(res.status).toBe(403);
  });

  test("matching header -> 200", async () => {
    process.env[ENV_KEY] = "secret";
    const res = await app.request("/internal", { headers: { "X-Internal-Key": "secret" } });
    expect(res.status).toBe(200);
  });
});

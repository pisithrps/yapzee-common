import { afterEach, describe, expect, test } from "bun:test";
import { createToken, decodeToken, requireJwtSecret } from "../src/auth.js";

const ENV_KEY = "YAPZEE_JWT_SECRET";
const originalSecret = process.env[ENV_KEY];

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalSecret;
  }
});

describe("auth", () => {
  test("token round trip", async () => {
    process.env[ENV_KEY] = "test-secret";
    const token = await createToken("user-123");
    expect(await decodeToken(token)).toBe("user-123");
  });

  test("decode garbage returns null", async () => {
    process.env[ENV_KEY] = "test-secret";
    expect(await decodeToken("not-a-jwt")).toBeNull();
  });

  test("missing secret fails loudly", async () => {
    delete process.env[ENV_KEY];
    expect(() => requireJwtSecret()).toThrow(/YAPZEE_JWT_SECRET/);
    await expect(createToken("user-123")).rejects.toThrow(/YAPZEE_JWT_SECRET/);
  });
});

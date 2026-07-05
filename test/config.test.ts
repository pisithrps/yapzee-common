import { describe, expect, test } from "bun:test";
import { MODELS, settings } from "../src/config.js";

describe("config", () => {
  test("MODELS shape", () => {
    expect(MODELS.length).toBeGreaterThan(0);
    for (const m of MODELS) {
      expect(m).toHaveProperty("label");
      expect(m).toHaveProperty("provider");
      expect(m).toHaveProperty("value");
    }
  });

  test("settings importable without JWT env", () => {
    // config must NOT throw at import when YAPZEE_JWT_SECRET is unset
    expect("OPENAI_API_KEY" in settings).toBe(true);
  });
});

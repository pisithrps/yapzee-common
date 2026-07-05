/**
 * Internal-only endpoint auth shared by all YapZee services.
 *
 * Gates service-to-service endpoints behind a shared secret header so the
 * gateway can strip it from public traffic while internal callers (other
 * services) still pass it explicitly.
 */

import type { MiddlewareHandler } from "hono";

export interface InternalKeyCheckResult {
  ok: boolean;
  status?: 403 | 500;
}

/**
 * Pure check, reusable outside of Hono. Reads `INTERNAL_API_KEY` from the
 * environment on every call (not cached), and compares it against the
 * supplied header value.
 *
 * Returns `{ ok: false, status: 500 }` if the env var isn't configured,
 * `{ ok: false, status: 403 }` on any mismatch (including a missing
 * header), and `{ ok: true }` on a match.
 */
export function checkInternalKey(headerValue: string | null): InternalKeyCheckResult {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    return { ok: false, status: 500 };
  }
  if (headerValue !== expected) {
    return { ok: false, status: 403 };
  }
  return { ok: true };
}

/** Hono middleware for internal-only endpoints. */
export const requireInternalKey: MiddlewareHandler = async (c, next) => {
  const result = checkInternalKey(c.req.header("X-Internal-Key") ?? null);
  if (!result.ok) {
    return c.text(
      result.status === 500
        ? "INTERNAL_API_KEY is not configured"
        : "Invalid or missing X-Internal-Key header",
      result.status as 403 | 500,
    );
  }
  await next();
};

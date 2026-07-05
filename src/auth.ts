/** JWT helpers shared by all YapZee services. */

import { jwtVerify, SignJWT } from "jose";
import { getJwtSecret, getJwtTtlDays, JWT_ALGORITHM } from "./config.js";

/** Fail fast for services that need JWT auth. Call at service startup. */
export function requireJwtSecret(): void {
  if (!getJwtSecret()) {
    throw new Error("YAPZEE_JWT_SECRET env var is required");
  }
}

export async function createToken(userId: string): Promise<string> {
  requireJwtSecret();
  const secret = new TextEncoder().encode(getJwtSecret());
  const now = Math.floor(Date.now() / 1000);
  const exp = now + getJwtTtlDays() * 24 * 60 * 60;
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secret);
}

/** Return user_id (sub) if token is valid, else null. */
export async function decodeToken(token: string): Promise<string | null> {
  requireJwtSecret();
  const secret = new TextEncoder().encode(getJwtSecret());
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [JWT_ALGORITHM] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

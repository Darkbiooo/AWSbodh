import { jwtVerify } from "jose/jwt/verify";
import { SignJWT } from "jose/jwt/sign";

export const sessionCookie = "bodh_session";
export function getAuthSecret(): Uint8Array {
  const secretKey =
    process.env.app_AUTH_SECRET ||
    process.env.app_JWT_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.JWT_SECRET;

  if (!secretKey) {
    console.warn(
      "[auth] Neither AUTH_SECRET nor JWT_SECRET is set in environment. Using fallback secret.",
    );
    return new TextEncoder().encode("bodh-production-secret-fallback-key");
  }
  return new TextEncoder().encode(secretKey);
}

export type Session = { email: string; name: string };

/** Demo session used when no auth cookie is present (hackathon / guest mode). */
export const DEMO_SESSION: Session = {
  email: "student_001@bodh.demo",
  name: "Demo Student",
};

export const DEMO_STUDENT_ID = "student_001";

export async function createSession(session: Session) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getAuthSecret());
}

export async function readSession(token: string | undefined) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());

    if (typeof payload.email !== "string" || typeof payload.name !== "string") {
      return null;
    }

    return {
      email: payload.email,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

/**
 * Returns the real session if the cookie is valid.
 * In development (or when ALLOW_DEMO=true), falls back to DEMO_SESSION.
 * In production without ALLOW_DEMO=true, throws an error to prevent unauthorized access.
 */
export async function getSessionOrDemo(
  token: string | undefined,
): Promise<Session> {
  const session = await readSession(token);
  if (session) return session;

  const allowDemo =
    process.env.app_ALLOW_DEMO === "true" ||
    process.env.ALLOW_DEMO === "true" ||
    process.env.NODE_ENV !== "production";

  if (!allowDemo) {
    throw new Error(
      "Authentication required. Demo session is disabled in production.",
    );
  }

  return DEMO_SESSION;
}

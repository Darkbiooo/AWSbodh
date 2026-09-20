import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose/jwt/verify";
import { sessionCookie, getAuthSecret } from "@/lib/auth/session";
import { validateProductionEnv } from "@/config/env";

let envValidated = false;

/** Routes that require a session. */
const PROTECTED = ["/dashboard", "/learn", "/onboarding"];

/** Routes that should redirect logged-in users to /dashboard. */
const AUTH_ONLY = ["/auth", "/"];

/**
 * Verifies JWT signature and returns payload if valid and unexpired.
 */
async function verifyJwtPayload(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  try {
    if (!envValidated && process.env.NODE_ENV === "production") {
      validateProductionEnv();
      envValidated = true;
    }

    const token = req.cookies.get(sessionCookie)?.value;
    const payload = token ? await verifyJwtPayload(token) : null;
    const isLoggedIn = !!payload?.email;

    const { pathname } = req.nextUrl;
    const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
    const isAuthOnly =
      pathname === "/" ||
      AUTH_ONLY.filter((p) => p !== "/").some((p) => pathname.startsWith(p));

    // Logged-in user visiting /auth → send to dashboard
    if (isLoggedIn && isAuthOnly) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Unauthenticated user visiting a protected route → send to /auth
    if (!isLoggedIn && isProtected) {
      const url = new URL("/auth", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  } catch (error) {
    console.error("[middleware] Error during middleware handling:", error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Run on all page routes except static files and API routes
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};

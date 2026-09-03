import { NextResponse, type NextRequest } from "next/server";
import {
  AuthError,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE_NAME,
  buildLoginUrl,
  isAuthEnabled,
  newState,
  verifyIdToken,
} from "@/lib/cognitoAuth";

const AUTH_ROUTE_PATHS = new Set(["/auth/login", "/auth/callback", "/auth/logout"]);

export async function proxy(request: NextRequest) {
  // No-op passthrough when auth is switched off, and until Cognito env vars
  // are set - see isAuthEnabled/isCognitoConfigured for why the latter must
  // fail open, not closed.
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  // request.nextUrl.pathname has the basePath ("/workflow") already stripped.
  const path = request.nextUrl.pathname;
  if (AUTH_ROUTE_PATHS.has(path)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let authenticated = false;
  if (token) {
    try {
      await verifyIdToken(token);
      authenticated = true;
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
    }
  }

  if (authenticated) {
    return NextResponse.next();
  }

  if (path.includes("/api/")) {
    return NextResponse.json({ detail: "unauthorized" }, { status: 401 });
  }

  const state = newState();
  const res = NextResponse.redirect(buildLoginUrl(state), 302);
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    maxAge: 300,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}

// The documented "match everything except _next/static|_next/image|favicon.ico"
// negative-lookahead pattern silently failed to match the bare root path
// under this app's basePath ("/workflow" -> "/" after stripping) - verified
// empirically that it never even invoked proxy() for "/". This unconditional
// pattern is simpler and confirmed to run for every path, static assets
// included; the extra JWT verification per asset request is cheap (JWKS is
// cached) and not worth the risk of another silent exclusion.
export const config = {
  matcher: ["/:path*"],
};

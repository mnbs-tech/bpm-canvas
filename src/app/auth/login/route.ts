import { NextResponse } from "next/server";
import { buildLoginUrl, isAuthEnabled, newState, OAUTH_STATE_COOKIE } from "@/lib/cognitoAuth";
import { BASE_PATH } from "@/lib/basePath";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Nothing to log into when the gate is off (docs/LOCAL_RUNBOOK.md), and
  // buildLoginUrl() on an empty COGNITO_DOMAIN yields a relative URL that
  // NextResponse.redirect throws on.
  if (!isAuthEnabled()) return NextResponse.redirect(new URL(`${BASE_PATH}/`, request.url));

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

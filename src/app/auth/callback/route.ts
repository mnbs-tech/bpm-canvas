import { NextResponse, type NextRequest } from "next/server";
import {
  AuthError,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  exchangeCodeForTokens,
  postLoginRedirectUrl,
  verifyIdToken,
} from "@/lib/cognitoAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return NextResponse.json(
      { error: `cognito error: ${error} - ${errorDescription ?? ""}`.trim() },
      { status: 400 }
    );
  }

  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "invalid or missing OAuth state" }, { status: 400 });
  }

  let idToken: string;
  try {
    const tokens = await exchangeCodeForTokens(code);
    await verifyIdToken(tokens.id_token);
    idToken = tokens.id_token;
  } catch (err) {
    const message = err instanceof AuthError || err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const res = NextResponse.redirect(postLoginRedirectUrl(), 302);
  res.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
  res.cookies.set(SESSION_COOKIE_NAME, idToken, {
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}

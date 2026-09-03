import { NextResponse } from "next/server";
import { buildLogoutUrl, isAuthEnabled, SESSION_COOKIE_NAME } from "@/lib/cognitoAuth";
import { BASE_PATH } from "@/lib/basePath";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Same reason as /auth/login: with the gate off there is no Hosted UI to
  // send the browser to, and buildLogoutUrl() would produce a relative URL.
  const target = isAuthEnabled()
    ? buildLogoutUrl()
    : new URL(`${BASE_PATH}/`, request.url).toString();
  const res = NextResponse.redirect(target, 302);
  res.cookies.set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}

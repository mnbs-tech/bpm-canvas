// Server-only: Cognito Hosted UI login. Can share a Cognito App Client (and
// session cookie name) across multiple apps on the same parent domain, so
// logging into one logs you into all of them via a shared session cookie -
// see this deployment's own systemd unit for the actual env values
// (non-secret ones inline, secrets via a gitignored env file).
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const COGNITO_REGION = process.env.COGNITO_REGION || "";
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || "";
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || "";
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || "";
const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN || "";
// No hardcoded fallback beyond "": the real value always comes from the env
// (see systemd/workflow-builder.service) - baking a specific deployment's own
// URL in here as a default would be wrong for anyone else running this code.
const COGNITO_REDIRECT_URI = process.env.COGNITO_REDIRECT_URI || "";
const COGNITO_LOGOUT_REDIRECT_URI = process.env.COGNITO_LOGOUT_REDIRECT_URI || "";

// Shared across claude-dashboard/s3manager/workflow-builder for SSO.
export const SESSION_COOKIE_NAME = "cd_session";
export const SESSION_COOKIE_MAX_AGE_SECONDS = Number(
  process.env.WORKFLOW_SESSION_MAX_AGE || 60 * 60 * 24
);
export const OAUTH_STATE_COOKIE = "cd_oauth_state";

export class AuthError extends Error {}

/**
 * Where to send the browser after a successful login. Deliberately NOT
 * derived from the incoming request's own origin: behind nginx, `next
 * start` sees the raw backend connection (127.0.0.1:8002), and Next.js's
 * NextURL silently normalizes any 127.x.x.x host to the literal string
 * "localhost" (see next/dist/server/web/next-url.js's
 * REGEX_LOCALHOST_HOSTNAME) - so request.nextUrl.origin resolves to
 * "https://localhost:8002", not the app's real public URL, even though
 * nginx forwards the real Host header. Deriving this from
 * COGNITO_REDIRECT_URI (which is already the correct public URL) sidesteps
 * that entirely.
 */
export function postLoginRedirectUrl(): string {
  return COGNITO_REDIRECT_URI.replace(/\/auth\/callback\/?$/, "");
}

/**
 * Until all three of COGNITO_DOMAIN/CLIENT_ID/USER_POOL_ID are set, auth is
 * a no-op passthrough - nginx's Basic Auth (if still in place) is the real
 * gate during that window. Flipping the gate on before Cognito is actually
 * configured would 302-loop every request to a domain that doesn't resolve,
 * locking the operator out entirely (see claude-dashboard/app/main.py).
 */
export function isCognitoConfigured(): boolean {
  return Boolean(COGNITO_DOMAIN && COGNITO_CLIENT_ID && COGNITO_USER_POOL_ID);
}

/**
 * `WORKFLOW_AUTH=off` turns the gate off deliberately, which is what a copy
 * running on someone's own PC does (docs/LOCAL_RUNBOOK.md): there is no
 * Cognito to log into there, and the app is only reachable from that machine.
 *
 * It exists as its own switch because the passthrough above is an *accident*
 * as far as a reader can tell - "no Cognito vars" also describes a server
 * whose secrets.env went missing. An operator reading `WORKFLOW_AUTH=off`
 * knows the open door was intended.
 */
export function isAuthEnabled(): boolean {
  return (process.env.WORKFLOW_AUTH || "").toLowerCase() !== "off" && isCognitoConfigured();
}

function issuer(): string {
  return `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(`${issuer()}/.well-known/jwks.json`));
  return jwks;
}

/** Verifies a Cognito ID token's signature (against cached JWKS), issuer,
 * audience and expiry, and returns its claims. Throws AuthError on any
 * failure - callers should treat that as "not logged in", not a 500. */
export async function verifyIdToken(token: string): Promise<JWTPayload> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, getJwks(), {
      issuer: issuer(),
      audience: COGNITO_CLIENT_ID,
    }));
  } catch (err) {
    throw new AuthError(err instanceof Error ? err.message : String(err));
  }
  if (payload.token_use !== "id") {
    throw new AuthError(`expected an ID token, got token_use=${String(payload.token_use)}`);
  }
  return payload;
}

export function newState(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export function buildLoginUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: COGNITO_CLIENT_ID,
    redirect_uri: COGNITO_REDIRECT_URI,
    scope: "openid email",
    state,
  });
  return `${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`;
}

export function buildLogoutUrl(): string {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    logout_uri: COGNITO_LOGOUT_REDIRECT_URI,
  });
  return `${COGNITO_DOMAIN}/logout?${params.toString()}`;
}

interface TokenResponse {
  id_token: string;
  access_token?: string;
  refresh_token?: string;
  [key: string]: unknown;
}

/** Authorization Code exchange (server-side, confidential client - the
 * secret goes in the POST body per client_secret_post, which is what a
 * Cognito app client with a generated secret expects by default). */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: COGNITO_CLIENT_ID,
    code,
    redirect_uri: COGNITO_REDIRECT_URI,
  });
  if (COGNITO_CLIENT_SECRET) body.set("client_secret", COGNITO_CLIENT_SECRET);

  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new AuthError(`token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

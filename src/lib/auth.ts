import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { upsertUser } from "@/lib/db";

const SESSION_COOKIE = "craft_session";
const OAUTH_STATE_COOKIE = "craft_oauth_state";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

interface SignedPayload {
  exp: number;
}

interface SessionPayload extends SignedPayload {
  user: AuthUser;
}

interface OAuthStatePayload extends SignedPayload {
  state: string;
  codeVerifier: string;
  returnTo: string;
}

interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  secret: string;
}

interface GoogleUserInfo {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
}

export const authCookieNames = {
  session: SESSION_COOKIE,
  oauthState: OAUTH_STATE_COOKIE,
} as const;

function getEnvValue(name: string) {
  return process.env[name]?.trim() || null;
}

function getGoogleAuthConfig(): GoogleAuthConfig | null {
  const clientId = getEnvValue("GOOGLE_CLIENT_ID");
  const clientSecret = getEnvValue("GOOGLE_CLIENT_SECRET");
  const secret = getEnvValue("AUTH_SECRET") ?? getEnvValue("NEXTAUTH_SECRET");

  if (!clientId || !clientSecret || !secret) return null;
  return { clientId, clientSecret, secret };
}

export function getMissingGoogleAuthEnv() {
  const envEntries: Array<[string, string | null]> = [
    ["GOOGLE_CLIENT_ID", getEnvValue("GOOGLE_CLIENT_ID")],
    ["GOOGLE_CLIENT_SECRET", getEnvValue("GOOGLE_CLIENT_SECRET")],
    ["AUTH_SECRET", getEnvValue("AUTH_SECRET") ?? getEnvValue("NEXTAUTH_SECRET")],
  ];

  return envEntries.filter(([, value]) => !value).map(([name]) => name);
}

export function isGoogleAuthConfigured() {
  return getMissingGoogleAuthEnv().length === 0;
}

function isAuthBypassEnabled() {
  return process.env.NODE_ENV !== "production" &&
    process.env.CRAFT_AUTH_BYPASS === "1";
}

function getBypassUser(): AuthUser | null {
  if (!isAuthBypassEnabled()) return null;

  const email = getEnvValue("CRAFT_AUTH_BYPASS_EMAIL") ?? "test@craft.local";
  return {
    id: `bypass:${email}`,
    email,
    name: "Craft Test User",
    picture: null,
  };
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function signPayload<T extends SignedPayload>(payload: T, secret: string) {
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifySignedPayload<T extends SignedPayload>(
  token: string | undefined,
  secret: string,
): T | null {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.byteLength !== expectedBuffer.byteLength ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as T;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getCookieFromHeader(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined;

  const prefix = `${name}=`;
  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);
}

function getSessionUserFromCookieValue(value: string | undefined) {
  const bypassUser = getBypassUser();
  if (bypassUser) return bypassUser;

  const config = getGoogleAuthConfig();
  if (!config) return null;

  const payload = verifySignedPayload<SessionPayload>(value, config.secret);
  return payload?.user ?? null;
}

export async function getCurrentUser() {
  const bypassUser = getBypassUser();
  if (bypassUser) return bypassUser;

  const cookieStore = await cookies();
  const user = getSessionUserFromCookieValue(cookieStore.get(SESSION_COOKIE)?.value);
  if (user) {
    await upsertUser(user);
  }

  return user;
}

export function getUserFromRequest(request: Request) {
  return getSessionUserFromCookieValue(
    getCookieFromHeader(request.headers.get("cookie"), SESSION_COOKIE),
  );
}

export function createUnauthorizedResponse() {
  return Response.json({ error: "Sign in with Google to continue." }, { status: 401 });
}

function getCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function setSessionCookie(response: Response, user: AuthUser, secret: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const value = signPayload({ exp: expiresAt, user }, secret);

  response.headers.append(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, value, getCookieOptions(SESSION_MAX_AGE_SECONDS)),
  );
}

export function clearSessionCookie(response: Response) {
  response.headers.append(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, "", getCookieOptions(0)),
  );
}

export function clearOAuthStateCookie(response: Response) {
  response.headers.append(
    "Set-Cookie",
    serializeCookie(OAUTH_STATE_COOKIE, "", getCookieOptions(0)),
  );
}

function serializeCookie(
  name: string,
  value: string,
  options: ReturnType<typeof getCookieOptions>,
) {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    "HttpOnly",
    `SameSite=${options.sameSite}`,
  ];

  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function randomToken(byteLength = 32) {
  return randomBytes(byteLength).toString("base64url");
}

function buildCodeChallenge(codeVerifier: string) {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

function getRequestOrigin(request: Request) {
  const configured = getEnvValue("AUTH_URL") ?? getEnvValue("NEXT_PUBLIC_APP_URL");
  if (configured) return configured.replace(/\/$/, "");

  const url = new URL(request.url);
  return url.origin;
}

function getGoogleRedirectUri(request: Request) {
  return `${getRequestOrigin(request)}/api/auth/google/callback`;
}

function normalizeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function createMutableRedirect(destination: URL, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: destination.toString() },
  });
}

export function createGoogleAuthRedirect(request: Request) {
  const config = getGoogleAuthConfig();
  if (!config) {
    return createMutableRedirect(new URL("/?auth=not-configured", request.url));
  }

  const state = randomToken();
  const codeVerifier = randomToken(48);
  const returnTo = normalizeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  const expiresAt = Math.floor(Date.now() / 1000) + OAUTH_STATE_MAX_AGE_SECONDS;
  const stateCookie = signPayload(
    { exp: expiresAt, state, codeVerifier, returnTo },
    config.secret,
  );

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", getGoogleRedirectUri(request));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", buildCodeChallenge(codeVerifier));
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = createMutableRedirect(authUrl);
  response.headers.append(
    "Set-Cookie",
    serializeCookie(
      OAUTH_STATE_COOKIE,
      stateCookie,
      getCookieOptions(OAUTH_STATE_MAX_AGE_SECONDS),
    ),
  );

  return response;
}

export async function completeGoogleAuth(request: Request) {
  const config = getGoogleAuthConfig();
  const requestUrl = new URL(request.url);

  if (!config) {
    return createMutableRedirect(new URL("/?auth=not-configured", request.url));
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");
  const stateCookie = getCookieFromHeader(request.headers.get("cookie"), OAUTH_STATE_COOKIE);
  const statePayload = verifySignedPayload<OAuthStatePayload>(stateCookie, config.secret);

  if (error || !code || !state || !statePayload || statePayload.state !== state) {
    const response = createMutableRedirect(new URL("/?auth=failed", request.url));
    clearOAuthStateCookie(response);
    return response;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: statePayload.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: getGoogleRedirectUri(request),
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Google token exchange failed.");
    }

    const tokenPayload = await tokenResponse.json() as { access_token?: string };
    if (!tokenPayload.access_token) {
      throw new Error("Google did not return an access token.");
    }

    const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new Error("Google profile lookup failed.");
    }

    const profile = await userInfoResponse.json() as GoogleUserInfo;
    if (
      typeof profile.sub !== "string" ||
      typeof profile.email !== "string" ||
      profile.email_verified === false
    ) {
      throw new Error("Google account email could not be verified.");
    }

    const user: AuthUser = {
      id: `google:${profile.sub}`,
      email: profile.email,
      name: typeof profile.name === "string" && profile.name.trim()
        ? profile.name
        : profile.email,
      picture: typeof profile.picture === "string" ? profile.picture : null,
    };

    await upsertUser(user);

    const response = createMutableRedirect(new URL(statePayload.returnTo, request.url));
    clearOAuthStateCookie(response);
    setSessionCookie(response, user, config.secret);
    return response;
  } catch {
    const response = createMutableRedirect(new URL("/?auth=failed", request.url));
    clearOAuthStateCookie(response);
    return response;
  }
}

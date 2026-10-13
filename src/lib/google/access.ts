import "server-only";
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { googleTokensFromJwt, hasSheetsScope, isExpired, refreshGoogleTokens } from "./refresh";

export type GoogleAccess =
  | { ok: true; accessToken: string }
  /** `missing`: never granted the Sheets scope. `expired`: the token can't be refreshed. */
  | { ok: false; reason: "missing" | "expired" };

/**
 * The signed-in user's Google access token, decrypted from the session cookie.
 * src/proxy.ts has normally refreshed it already; if not, it is refreshed here
 * for this request only.
 */
export async function getGoogleAccess(): Promise<GoogleAccess> {
  const req = { headers: await headers() };
  const secret = env.authSecret;
  // Auth.js names the cookie `__Secure-…` over https. The name is also the
  // decryption salt, so only the right one decodes.
  const token =
    (await getToken({ req, secret, secureCookie: true })) ?? (await getToken({ req, secret, secureCookie: false }));
  const tokens = token && googleTokensFromJwt(token);
  if (!tokens || !hasSheetsScope(tokens.scope)) return { ok: false, reason: "missing" };
  if (!isExpired(tokens, Math.floor(Date.now() / 1000))) return { ok: true, accessToken: tokens.accessToken };
  try {
    const fresh = await refreshGoogleTokens(tokens, env.googleOAuth);
    return { ok: true, accessToken: fresh.accessToken };
  } catch {
    return { ok: false, reason: "expired" };
  }
}

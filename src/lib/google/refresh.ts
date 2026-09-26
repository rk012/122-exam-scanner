/**
 * Google OAuth token refresh, kept framework-free so it can be unit-tested.
 * Auth.js stores these fields in the (encrypted) session JWT.
 */

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  /** Unix seconds. */
  expiresAt: number;
  /** Space-separated scopes Google actually granted. */
  scope?: string;
}

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function hasSheetsScope(scope: string | undefined): boolean {
  return (scope ?? "").split(/\s+/).includes(SHEETS_SCOPE);
}

/** Expired, or expiring within the safety margin (default 60s). */
export function isExpired(tokens: Pick<GoogleTokens, "expiresAt">, nowSeconds: number, marginSeconds = 60): boolean {
  return tokens.expiresAt - marginSeconds <= nowSeconds;
}

export class TokenRefreshError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "TokenRefreshError";
  }
}

export interface RefreshOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: () => number; // ms
  endpoint?: string;
}

export async function refreshGoogleTokens(tokens: GoogleTokens, opts: RefreshOptions): Promise<GoogleTokens> {
  if (!tokens.refreshToken) {
    throw new TokenRefreshError("No refresh token; the user must sign in again");
  }
  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(opts.endpoint ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token || typeof body.expires_in !== "number") {
    throw new TokenRefreshError(
      `Google token refresh failed: ${body.error ?? res.status}${body.error_description ? ` (${body.error_description})` : ""}`,
      res.status,
    );
  }
  const nowMs = (opts.now ?? Date.now)();
  return {
    accessToken: body.access_token,
    // Google usually omits refresh_token on refresh; keep the one we have.
    refreshToken: body.refresh_token ?? tokens.refreshToken,
    expiresAt: Math.floor(nowMs / 1000) + body.expires_in,
    scope: body.scope ?? tokens.scope,
  };
}

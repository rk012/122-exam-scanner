import { describe, expect, it } from "vitest";
import { hasSheetsScope, isExpired, refreshGoogleTokens, SHEETS_SCOPE, TokenRefreshError } from "./refresh";

const base = { accessToken: "old", refreshToken: "r1", expiresAt: 1000, scope: "openid email" };

function fakeFetch(status: number, json: unknown, seen: { body?: string; url?: string } = {}) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url);
    seen.body = String(init?.body);
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
}

describe("isExpired / hasSheetsScope", () => {
  it("treats the margin as expired", () => {
    expect(isExpired({ expiresAt: 1000 }, 900)).toBe(false);
    expect(isExpired({ expiresAt: 1000 }, 950)).toBe(true);
    expect(isExpired({ expiresAt: 1000 }, 2000)).toBe(true);
  });
  it("detects the sheets scope among granted scopes", () => {
    expect(hasSheetsScope(`openid ${SHEETS_SCOPE} email`)).toBe(true);
    expect(hasSheetsScope("openid email")).toBe(false);
    expect(hasSheetsScope(undefined)).toBe(false);
  });
});

describe("refreshGoogleTokens", () => {
  it("posts the refresh grant and returns new tokens, keeping the old refresh token", async () => {
    const seen: { body?: string; url?: string } = {};
    const out = await refreshGoogleTokens(base, {
      clientId: "cid",
      clientSecret: "sec",
      fetch: fakeFetch(200, { access_token: "new", expires_in: 3600, scope: "openid email" }, seen),
      now: () => 5_000_000,
    });
    expect(out).toEqual({ accessToken: "new", refreshToken: "r1", expiresAt: 5000 + 3600, scope: "openid email" });
    const params = new URLSearchParams(seen.body);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("r1");
    expect(params.get("client_secret")).toBe("sec");
  });

  it("adopts a rotated refresh token when Google sends one", async () => {
    const out = await refreshGoogleTokens(base, {
      clientId: "cid",
      clientSecret: "sec",
      fetch: fakeFetch(200, { access_token: "new", expires_in: 10, refresh_token: "r2" }),
    });
    expect(out.refreshToken).toBe("r2");
  });

  it("throws a TokenRefreshError with Google's reason", async () => {
    await expect(
      refreshGoogleTokens(base, {
        clientId: "cid",
        clientSecret: "sec",
        fetch: fakeFetch(400, { error: "invalid_grant", error_description: "Token has been revoked." }),
      }),
    ).rejects.toThrowError(/invalid_grant.*revoked/);
  });

  it("throws without a refresh token and never calls fetch", async () => {
    let called = false;
    await expect(
      refreshGoogleTokens({ ...base, refreshToken: undefined }, {
        clientId: "cid",
        clientSecret: "sec",
        fetch: (async () => { called = true; return new Response("{}"); }) as typeof fetch,
      }),
    ).rejects.toThrowError(TokenRefreshError);
    expect(called).toBe(false);
  });
});

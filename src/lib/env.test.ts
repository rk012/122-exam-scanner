import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env, MissingEnvError, parseAndrewIdList } from "./env";

const KEYS = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "AUTH_SECRET",
  "SUPERUSERS",
] as const;

let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("parseAndrewIdList", () => {
  it("splits, trims, lowercases and drops empties", () => {
    expect([...parseAndrewIdList(" Rishikum, foo ,,BAR ")]).toEqual([
      "rishikum",
      "foo",
      "bar",
    ]);
  });
  it("is empty for undefined or blank input", () => {
    expect(parseAndrewIdList(undefined).size).toBe(0);
    expect(parseAndrewIdList("   ").size).toBe(0);
  });
});

describe("env", () => {
  it("reports OAuth as unconfigured when either half is missing", () => {
    expect(env.hasGoogleOAuth).toBe(false);
    process.env.GOOGLE_OAUTH_CLIENT_ID = "id";
    expect(env.hasGoogleOAuth).toBe(false);
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
    expect(env.hasGoogleOAuth).toBe(true);
  });

  it("throws a MissingEnvError naming the variable on access", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "id";
    expect(() => env.googleOAuth).toThrowError(MissingEnvError);
    expect(() => env.googleOAuth).toThrowError(/GOOGLE_OAUTH_CLIENT_SECRET/);
  });

  it("treats whitespace-only values as missing", () => {
    process.env.AUTH_SECRET = "   ";
    expect(env.hasAuthSecret).toBe(false);
    expect(() => env.authSecret).toThrowError(/AUTH_SECRET/);
  });

  it("returns the configured OAuth client, trimmed", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = " id ";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
    expect(env.googleOAuth).toEqual({ clientId: "id", clientSecret: "secret" });
  });

  it("superusers is empty, not an error, when unset", () => {
    expect(env.superusers.size).toBe(0);
    process.env.SUPERUSERS = "rishikum,other";
    expect(env.superusers.has("rishikum")).toBe(true);
    expect(env.superusers.has("nobody")).toBe(false);
  });
});

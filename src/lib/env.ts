/**
 * Typed access to the per-deployment secrets and config.
 *
 * Everything here is read lazily, at the moment a value is needed, rather
 * than at import time. That keeps `next build` working on a machine (or a CI
 * job) that has no secrets, while still failing loudly with a specific
 * message the first time a request actually needs a value that is missing.
 *
 * The full list of what is expected to be set per deployment lives in
 * `.env.example`. `APP_ENV` is handled separately in `./build` because it is
 * deliberately eager and has a committed default.
 *
 * Nothing in this module may ever be prefixed NEXT_PUBLIC_: the OAuth client
 * secret must never reach the browser bundle.
 */

export class MissingEnvError extends Error {
  constructor(public readonly name_: string, hint: string) {
    super(`Missing required environment variable ${name_}. ${hint}`);
    this.name = "MissingEnvError";
  }
}

function read(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function require_(name: string, hint: string): string {
  const value = read(name);
  if (value === undefined) throw new MissingEnvError(name, hint);
  return value;
}

/** Parses a comma-separated list of Andrew IDs into a normalized set. */
export function parseAndrewIdList(raw: string | undefined): ReadonlySet<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export const env = {
  /**
   * Google OAuth client used for sign-in and, later, the Sheets write as the
   * TA. One client per deployment so the QA client can stay in Testing status.
   */
  get googleOAuth(): GoogleOAuthConfig {
    const hint =
      "Create an OAuth 2.0 Client ID (Web application) in the GCP project for " +
      "this deployment and set it as a Vercel environment variable.";
    return {
      clientId: require_("GOOGLE_OAUTH_CLIENT_ID", hint),
      clientSecret: require_("GOOGLE_OAUTH_CLIENT_SECRET", hint),
    };
  },

  /** True when both halves of the OAuth client are present. Never reveals them. */
  get hasGoogleOAuth(): boolean {
    return (
      read("GOOGLE_OAUTH_CLIENT_ID") !== undefined &&
      read("GOOGLE_OAUTH_CLIENT_SECRET") !== undefined
    );
  },

  /** Secret used to sign session cookies. */
  get authSecret(): string {
    return require_(
      "AUTH_SECRET",
      "Generate one with `openssl rand -base64 32` and set it per deployment.",
    );
  },

  get hasAuthSecret(): boolean {
    return read("AUTH_SECRET") !== undefined;
  },

  /**
   * Andrew IDs of head TAs who may edit app configuration. Missing or empty
   * means nobody is a superuser, which is safe: the setup screen is read-only.
   */
  get superusers(): ReadonlySet<string> {
    return parseAndrewIdList(read("SUPERUSERS"));
  },
};

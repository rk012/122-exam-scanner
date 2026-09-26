import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/lib/env";
import {
  ANDREW_DOMAIN,
  andrewIdFromEmail,
  isAllowedGoogleAccount,
  roleFor,
  type Role,
} from "@/lib/auth/roles";
import {
  isExpired,
  refreshGoogleTokens,
  SHEETS_SCOPE,
  type GoogleTokens,
} from "@/lib/google/refresh";

declare module "next-auth" {
  interface Session {
    user: {
      andrewId: string;
      role: Role;
    } & DefaultSession["user"];
    /**
     * Server-side only. Present when the session carries Google tokens.
     * Never pass the whole session object to a client component.
     */
    google?: GoogleTokens & { error?: "refresh-failed" };
  }
}

// Read at module load so that a deployment without an OAuth client still
// builds and serves the sign-in page (which explains what is missing) instead
// of crashing every route. env.hasGoogleOAuth is what the UI checks.
const oauth = env.hasGoogleOAuth
  ? env.googleOAuth
  : { clientId: "", clientSecret: "" };

function tokensFromJwt(token: Record<string, unknown>): GoogleTokens | null {
  if (typeof token.accessToken !== "string" || typeof token.expiresAt !== "number") return null;
  return {
    accessToken: token.accessToken,
    refreshToken: typeof token.refreshToken === "string" ? token.refreshToken : undefined,
    expiresAt: token.expiresAt,
    scope: typeof token.scope === "string" ? token.scope : undefined,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js also reads AUTH_SECRET itself; passing it keeps env.ts the one
  // place that knows the variable name.
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/", error: "/" },
  providers: [
    Google({
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      authorization: {
        params: {
          // Pre-filters Google's account chooser to the CMU Workspace. This is
          // a UX hint only; isAllowedGoogleAccount is the real check.
          hd: ANDREW_DOMAIN,
          // `consent` is required for Google to issue a refresh token, which
          // keeps a proctor signed in across an exam night longer than the
          // one-hour access token.
          prompt: "select_account consent",
          access_type: "offline",
          // The Sheets scope is what lets the app tick the checkbox *as the
          // TA*, so the sheet's own edit history records their name.
          scope: `openid email profile ${SHEETS_SCOPE}`,
        },
      },
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      return isAllowedGoogleAccount(profile ?? {});
    },
    async jwt({ token, profile, account }) {
      if (profile) {
        const andrewId = andrewIdFromEmail(profile.email);
        if (andrewId) token.andrewId = andrewId;
      }
      if (account?.access_token) {
        // Initial sign-in: stash Google's tokens in the encrypted JWT.
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.expiresAt = account.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
        token.scope = account.scope;
        delete token.refreshError;
        return token;
      }
      const current = tokensFromJwt(token);
      if (current && isExpired(current, Math.floor(Date.now() / 1000))) {
        try {
          const fresh = await refreshGoogleTokens(current, env.googleOAuth);
          token.accessToken = fresh.accessToken;
          token.refreshToken = fresh.refreshToken;
          token.expiresAt = fresh.expiresAt;
          token.scope = fresh.scope;
          delete token.refreshError;
        } catch {
          token.refreshError = "refresh-failed";
        }
      }
      return token;
    },
    session({ session, token }) {
      // The JWT carries arbitrary claims; narrow ours at runtime rather than
      // augmenting the JWT type, which this Auth.js beta does not export.
      const fromToken = typeof token.andrewId === "string" ? token.andrewId : null;
      const andrewId = fromToken ?? andrewIdFromEmail(session.user?.email) ?? "";
      session.user.andrewId = andrewId;
      session.user.role = roleFor(andrewId, env.superusers);
      const tokens = tokensFromJwt(token);
      if (tokens) {
        session.google =
          token.refreshError === "refresh-failed" ? { ...tokens, error: "refresh-failed" } : tokens;
      }
      return session;
    },
  },
});

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

declare module "next-auth" {
  interface Session {
    user: {
      andrewId: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

// Read at module load so that a deployment without an OAuth client still
// builds and serves the sign-in page (which explains what is missing) instead
// of crashing every route. env.hasGoogleOAuth is what the UI checks.
const oauth = env.hasGoogleOAuth
  ? env.googleOAuth
  : { clientId: "", clientSecret: "" };

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
          prompt: "select_account",
          // Sheets scope is deliberately NOT requested yet. It will be added
          // (with access_type=offline) once the GCP app can request it.
        },
      },
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      return isAllowedGoogleAccount(profile ?? {});
    },
    jwt({ token, profile }) {
      if (profile) {
        const andrewId = andrewIdFromEmail(profile.email);
        if (andrewId) token.andrewId = andrewId;
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
      return session;
    },
  },
});

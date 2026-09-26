/**
 * Pure helpers for turning a Google identity into an app identity.
 * Kept free of framework imports so they are trivially unit-testable.
 */

export const ANDREW_DOMAIN = "andrew.cmu.edu";

export type Role = "superadmin" | "user";

/**
 * Extracts the Andrew ID from an @andrew.cmu.edu address. Returns null for
 * anything else, including other CMU domains and empty input.
 */
export function andrewIdFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const local = email.slice(0, at).trim().toLowerCase();
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (domain !== ANDREW_DOMAIN || local.length === 0) return null;
  return local;
}

/**
 * Decides whether a Google sign-in is allowed at all. Requires the account to
 * be in the andrew.cmu.edu Workspace (Google's `hd` claim) *and* to have an
 * @andrew.cmu.edu address. Checking both means a personal Gmail with an
 * andrew-looking alias cannot get in.
 */
export function isAllowedGoogleAccount(profile: {
  email?: string | null;
  email_verified?: boolean | null;
  hd?: string | null;
}): boolean {
  if (profile.email_verified === false) return false;
  if (profile.hd !== ANDREW_DOMAIN) return false;
  return andrewIdFromEmail(profile.email) !== null;
}

/** Role is derived on every request so a SUPERUSERS change needs no re-login. */
export function roleFor(andrewId: string, superusers: ReadonlySet<string>): Role {
  return superusers.has(andrewId.toLowerCase()) ? "superadmin" : "user";
}

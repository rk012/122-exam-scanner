"use server";

import { signIn } from "@/auth";

/**
 * Restarts Google sign-in and comes back to `redirectTo`, for when the
 * session's Google token can't be refreshed or Sheets access was not granted.
 */
export async function signInAgainAction(redirectTo: string): Promise<void> {
  await signIn("google", { redirectTo });
}

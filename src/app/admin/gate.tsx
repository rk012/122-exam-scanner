import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { env } from "@/lib/env";

/**
 * What an admin page renders instead of itself when the caller may not see
 * it, or `null` for a superadmin on a deployment with a database.
 */
export async function superadminGate(): Promise<ReactNode | null> {
  const session = await auth();
  if (!session?.user) {
    return (
      <p className="text-sm">
        <Link href="/" className="underline">
          Sign in
        </Link>{" "}
        to continue.
      </p>
    );
  }
  if (session.user.role !== "superadmin") {
    return (
      <p role="alert" className="text-sm">
        Only superadmins can use the admin page.
      </p>
    );
  }
  if (!env.hasDatabaseUrl) {
    return (
      <p role="alert" className="text-sm">
        No database is configured on this deployment.
      </p>
    );
  }
  return null;
}

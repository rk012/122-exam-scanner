"use client";

import { usePathname } from "next/navigation";
import { signInAgainAction } from "@/app/actions";
import { needsSignIn, type ApiError } from "@/lib/scan/client";

/** A scan API error, with the one way out that can fix it. */
export function ScanApiErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const pathname = usePathname();
  const button =
    "mt-2 rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900";
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <p>{error.message}</p>
      {needsSignIn(error) ? (
        <form action={signInAgainAction.bind(null, pathname)}>
          <button type="submit" className={button}>
            Sign in again
          </button>
        </form>
      ) : (
        onRetry && (
          <button type="button" onClick={onRetry} className={button}>
            Try again
          </button>
        )
      )}
    </div>
  );
}

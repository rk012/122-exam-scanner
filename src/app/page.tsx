import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { QaBadge } from "@/components/QaBadge";
import { getDb } from "@/db";
import { env } from "@/lib/env";
import { isProctor } from "@/lib/users/proctors";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "That account is not an andrew.cmu.edu account. Sign in with your Andrew Google account.",
  Configuration:
    "Sign-in is not configured on this deployment yet. A head TA needs to set the Google OAuth client.",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await auth();
  const { error } = await searchParams;
  const errorKey = typeof error === "string" ? error : undefined;
  const errorMessage = errorKey
    ? (ERROR_MESSAGES[errorKey] ?? "Sign-in failed. Try again.")
    : undefined;

  if (session?.user) {
    const { andrewId, role } = session.user;
    // Superadmins are implicitly proctors. Without a database nobody else is,
    // which matches the fallback of checking boxes in the sheet by hand.
    const onProctorList =
      role === "superadmin" || (env.hasDatabaseUrl && (await isProctor(getDb(), andrewId)));
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Signed in</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            You are signed in with your Andrew Google account.
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-neutral-500">Andrew ID</dt>
          <dd className="font-mono">{andrewId}</dd>
          <dt className="text-neutral-500">Role</dt>
          <dd>
            {role === "superadmin" ? (
              <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                Superadmin
              </span>
            ) : (
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                Regular user
              </span>
            )}
          </dd>
          <dt className="text-neutral-500">Proctor list</dt>
          <dd className="text-sm">{onProctorList ? "On the list" : "Not on the list"}</dd>
        </dl>
        {!onProctorList && (
          <p
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            Not on the proctor list: ask a head TA to add you, or check boxes in the sheet
            directly.
          </p>
        )}
        {role === "superadmin" && (
          <Link href="/admin/users" className="text-sm underline">
            Manage users
          </Link>
        )}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  }

  const configured = env.hasGoogleOAuth && env.hasAuthSecret;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <QaBadge />
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Use your Andrew Google account. Only andrew.cmu.edu accounts are accepted.
      </p>
      {errorMessage && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {errorMessage}
        </p>
      )}
      {configured ? (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Continue with Google
          </button>
        </form>
      ) : (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          Sign-in is not configured on this deployment. See{" "}
          <Link href="/status" className="underline">
            deployment status
          </Link>{" "}
          for what is missing.
        </p>
      )}
      <div className="text-xs text-neutral-500">
        <p className="font-medium">What this app asks for</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Your Google account&apos;s email address, to identify you by Andrew ID.</li>
          <li>Later, permission to edit the check-in spreadsheet as you. Not requested yet.</li>
        </ul>
        <p className="mt-2 font-medium">What it stores</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Your Andrew ID, exam numbers you scan, and timestamps. Nothing else.</li>
        </ul>
      </div>
    </div>
  );
}

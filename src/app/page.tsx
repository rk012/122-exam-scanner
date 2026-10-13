import Link from "next/link";
import { auth, signIn } from "@/auth";
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

    if (role === "superadmin") {
      return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <SignedIn andrewId={andrewId} />
          <div>
            <Link
              href="/admin"
              className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Manage users
            </Link>
          </div>
        </div>
      );
    }

    // Without a database nobody is on the list, which matches the fallback of
    // checking boxes in the sheet by hand.
    const onProctorList = env.hasDatabaseUrl && (await isProctor(getDb(), andrewId));
    if (onProctorList) {
      return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <SignedIn andrewId={andrewId} />
        </div>
      );
    }

    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Not authorized</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="font-mono">{andrewId}</span> is not on the proctor list.
          </p>
        </div>
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
          Sign-in is not configured on this deployment.
        </p>
      )}
      <div className="text-xs text-neutral-500">
        <p className="font-medium">What this app asks for</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Your Google account&apos;s email address, to identify you by Andrew ID.</li>
          <li>Permission to edit the check-in spreadsheet as you, so the sheet&apos;s own history records your name.</li>
        </ul>
        <p className="mt-2 font-medium">What it stores</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Your Andrew ID, exam numbers you scan, and timestamps. Nothing else.</li>
        </ul>
      </div>
    </div>
  );
}

function SignedIn({ andrewId }: { andrewId: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Signed in</h1>
      <p className="mt-1 font-mono text-sm text-neutral-600 dark:text-neutral-400">{andrewId}</p>
    </div>
  );
}

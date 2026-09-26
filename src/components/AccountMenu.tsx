import { auth } from "@/auth";

/** Header slot: shows who is signed in, or nothing when signed out. */
export async function AccountMenu() {
  const session = await auth();
  if (!session?.user) return null;
  const { andrewId, role } = session.user;
  return (
    <span className="ml-auto flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
      <span className="font-mono">{andrewId}</span>
      {role === "superadmin" && (
        <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-900 dark:bg-violet-950 dark:text-violet-200">
          superadmin
        </span>
      )}
    </span>
  );
}

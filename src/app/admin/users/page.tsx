import Link from "next/link";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { env } from "@/lib/env";
import { listProctors } from "@/lib/users/proctors";
import { AddProctorsForm } from "./AddProctorsForm";
import { removeProctorAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
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
        Only superadmins can manage the proctor list.
      </p>
    );
  }
  if (!env.hasDatabaseUrl) {
    return (
      <p role="alert" className="text-sm">
        No database is configured on this deployment. See{" "}
        <Link href="/status" className="underline">
          deployment status
        </Link>
        .
      </p>
    );
  }

  const rows = await listProctors(getDb());
  const superusers = [...env.superusers].sort();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Regular users are proctors allowed to use the scanner. Superadmins are set per
          deployment and cannot be edited here.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-medium text-neutral-500">Superadmins ({superusers.length})</h2>
        <ul className="mt-2 flex flex-wrap gap-2 font-mono text-sm">
          {superusers.map((id) => (
            <li key={id} className="rounded bg-violet-100 px-2 py-0.5 text-violet-900 dark:bg-violet-950 dark:text-violet-200">
              {id}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-neutral-500">Proctors ({rows.length})</h2>
        <AddProctorsForm />
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500">No proctors yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1 pr-4 font-medium">Andrew ID</th>
                  <th className="py-1 pr-4 font-medium">Added by</th>
                  <th className="py-1 pr-4 font-medium">Added</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.andrewId} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="py-1.5 pr-4 font-mono">{r.andrewId}</td>
                    <td className="py-1.5 pr-4 font-mono">{r.addedBy}</td>
                    <td className="py-1.5 pr-4 text-neutral-500">
                      {r.addedAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="py-1.5 text-right">
                      <form action={removeProctorAction}>
                        <input type="hidden" name="andrewId" value={r.andrewId} />
                        <button
                          type="submit"
                          className="text-xs text-red-700 underline dark:text-red-400"
                          aria-label={`Remove ${r.andrewId}`}
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

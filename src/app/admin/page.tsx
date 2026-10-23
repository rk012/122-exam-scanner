import Link from "next/link";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { getActiveSheet, spreadsheetUrl } from "@/lib/config/activeSheet";
import { env } from "@/lib/env";
import { listProctors } from "@/lib/users/proctors";
import { ActiveSheetForm } from "./ActiveSheetForm";
import { ActiveSheetSummary } from "./ActiveSheetSummary";
import { ProctorsSection } from "./ProctorsSection";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
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

  const db = getDb();
  const [rows, active] = await Promise.all([listProctors(db), getActiveSheet(db)]);
  const proctorIds = rows.map((r) => r.andrewId);
  const superusers = [...env.superusers].sort();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium text-neutral-500">Active sheet</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            The checkin spreadsheet and tab in use for the current exam session. Saving checks
            that it is reachable and matches expected layout first.
          </p>
        </div>
        {active ? (
          // Keyed so saving or clearing drops rooms fetched for the old sheet.
          <ActiveSheetSummary
            key={`${active.spreadsheetId}/${active.tab}`}
            active={active}
            sheetUrl={spreadsheetUrl(active.spreadsheetId)}
          />
        ) : (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            No active sheet yet. Scanning is disabled until one is set.
          </p>
        )}
        <ActiveSheetForm current={active} />
      </section>

      <section className="flex flex-col gap-6">
        <div>
          <h2 className="text-sm font-medium text-neutral-500">Users</h2>
        </div>

        <div>
          <h3 className="text-xs font-medium text-neutral-500">Superadmins ({superusers.length})</h3>
          <ul className="mt-2 flex flex-wrap gap-2 font-mono text-sm">
            {superusers.map((id) => (
              <li key={id} className="rounded bg-violet-100 px-2 py-0.5 text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                {id}
              </li>
            ))}
          </ul>
        </div>

        {/* Keyed so a server re-render with a different list (e.g. after saving
            the sheet) replaces the client copy. */}
        <ProctorsSection key={proctorIds.join(",")} initial={proctorIds} />
      </section>
    </div>
  );
}

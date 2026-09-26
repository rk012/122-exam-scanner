import Link from "next/link";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { getActiveSheet } from "@/lib/config/activeSheet";
import { env } from "@/lib/env";
import { ActiveSheetForm } from "./ActiveSheetForm";

export const dynamic = "force-dynamic";

export default async function SheetAdminPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <p className="text-sm">
        <Link href="/" className="underline">Sign in</Link> to continue.
      </p>
    );
  }
  if (session.user.role !== "superadmin") {
    return <p role="alert" className="text-sm">Only superadmins can change the active sheet.</p>;
  }
  if (!env.hasDatabaseUrl) {
    return (
      <p role="alert" className="text-sm">
        No database is configured on this deployment. See <Link href="/status" className="underline">deployment status</Link>.
      </p>
    );
  }
  const active = await getActiveSheet(getDb());
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Active sheet</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          The one spreadsheet and tab the scanner is allowed to read and write tonight. Saving checks
          that it is reachable and laid out like TEMPLATE first.
        </p>
      </div>
      {active ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Currently <span className="font-mono">{active.tab}</span> in{" "}
          <span className="font-mono">{active.spreadsheetId}</span>, set by{" "}
          <span className="font-mono">{active.updatedBy}</span> on {active.updatedAt.toISOString().slice(0, 10)}.
        </p>
      ) : (
        <p className="text-sm text-amber-800 dark:text-amber-300">No active sheet yet. Scanning is disabled until one is set.</p>
      )}
      <ActiveSheetForm current={active ? { spreadsheetId: active.spreadsheetId, tab: active.tab } : null} />
    </div>
  );
}

import Link from "next/link";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { getActiveSheet, spreadsheetUrl, type ActiveSheet } from "@/lib/config/activeSheet";
import { env } from "@/lib/env";
import { getGoogleAccess } from "@/lib/google/access";
import { createGoogleSheetsApi, describeLayout, openCheckinSheet, type RoomBlock } from "@/lib/sheets";
import { listProctors } from "@/lib/users/proctors";
import { ActiveSheetForm, ClearActiveSheetButtons } from "./ActiveSheetForm";
import { AddProctorsForm } from "./AddProctorsForm";
import { removeProctorAction } from "./actions";

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
  const details = active ? await loadSheetDetails(active) : null;
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
        {active && details ? (
          <ActiveSheetSummary active={active} details={details} />
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

        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-medium text-neutral-500">Proctors ({rows.length})</h3>
          <AddProctorsForm />
          {rows.length === 0 ? (
            <p className="text-sm text-neutral-500">No proctors yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th className="py-1 pr-4 font-medium">Andrew ID</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.andrewId} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="py-1.5 pr-4 font-mono">{r.andrewId}</td>
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
        </div>
      </section>
    </div>
  );
}

type SheetDetails =
  | {
    reachable: true;
    title: string | null;
    gid: number | undefined;
    /** `null` when no tab is set. */
    rooms: RoomBlock[] | null;
    problem: string | null;
  }
  | { reachable: false; message: string };

/** Live title, tab and rooms of the active sheet, read as this superadmin. */
async function loadSheetDetails(active: ActiveSheet): Promise<SheetDetails> {
  const google = await getGoogleAccess();
  if (!google.ok) {
    return { reachable: false, message: "Sign in again and allow spreadsheet access to see its name and rooms." };
  }
  const api = createGoogleSheetsApi({ getAccessToken: async () => google.accessToken });
  if (active.tab === null) {
    try {
      const info = await api.getInfo(active.spreadsheetId);
      return { reachable: true, title: info.title || null, gid: undefined, rooms: null, problem: null };
    } catch (e) {
      return { reachable: false, message: `Spreadsheet unreachable: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const sheet = openCheckinSheet({
    api,
    spreadsheetId: active.spreadsheetId,
    tab: active.tab,
    allowedSpreadsheetIds: [active.spreadsheetId],
  });
  const [info, result] = await Promise.all([sheet.info().catch(() => null), sheet.reloadLayout()]);
  if (!result.reachable) return { reachable: false, message: `Spreadsheet ${result.summary}` };
  const tab = active.tab.toLowerCase();
  return {
    reachable: true,
    title: info?.title || null,
    gid: info?.tabs.find((t) => t.title.toLowerCase() === tab)?.gid,
    rooms: result.layout.blocks,
    problem: result.layout.ok ? null : describeLayout(result.layout),
  };
}

function ActiveSheetSummary({ active, details }: { active: ActiveSheet; details: SheetDetails }) {
  const link = "font-medium underline";
  const title = details.reachable && details.title ? details.title : active.spreadsheetId;
  const gid = details.reachable ? details.gid : undefined;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        <a href={spreadsheetUrl(active.spreadsheetId)} target="_blank" rel="noreferrer" className={link}>
          {title}
        </a>
        {active.tab !== null && (
          <>
            {" › "}
            {gid === undefined ? (
              <span className="font-mono">{active.tab}</span>
            ) : (
              <a
                href={spreadsheetUrl(active.spreadsheetId, gid)}
                target="_blank"
                rel="noreferrer"
                className={`${link} font-mono`}
              >
                {active.tab}
              </a>
            )}
          </>
        )}
      </p>
      {active.tab === null && (
        <p className="text-amber-800 dark:text-amber-300">No tab set. Scanning is disabled until one is set.</p>
      )}
      {!details.reachable ? (
        <p role="alert" className="text-amber-800 dark:text-amber-300">{details.message}</p>
      ) : (
        <>
          {details.problem && (
            <p role="alert" className="text-amber-800 dark:text-amber-300">{details.problem}</p>
          )}
          {details.rooms && (
            <div>
              <h3 className="text-xs font-medium text-neutral-500">Rooms ({details.rooms.length})</h3>
              <ul className="mt-1 flex flex-col gap-0.5">
                {details.rooms.map((r) => (
                  <li key={r.code} className="flex gap-3">
                    <span className="w-8 shrink-0 font-mono text-neutral-500">{r.code}</span>
                    <span>{r.room}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <ClearActiveSheetButtons hasTab={active.tab !== null} />
    </div>
  );
}

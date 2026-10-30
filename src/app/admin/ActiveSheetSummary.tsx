"use client";

import { useActionState } from "react";
import type { ActiveSheet } from "@/lib/config/activeSheet";
import { ClearActiveSheetButtons } from "./ActiveSheetForm";
import { loadActiveSheetDetailsAction, type SheetDetails } from "./actions";

/**
 * The active sheet's link and tab from the saved config. Its name, tab link
 * and rooms come from Google only when asked, so loading /admin stays fast.
 */
export function ActiveSheetSummary({ active, sheetUrl }: { active: ActiveSheet; sheetUrl: string }) {
  const [details, fetchDetails, pending] = useActionState<SheetDetails | null, FormData>(
    () => loadActiveSheetDetailsAction(),
    null,
  );
  const link = "font-medium underline";
  const title = details?.reachable && details.title ? details.title : active.spreadsheetId;
  const tabUrl = details?.reachable ? details.tabUrl : null;
  const fetchLabel = active.tab === null ? "Check spreadsheet" : "Fetch rooms";
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="break-all">
        <a href={sheetUrl} target="_blank" rel="noreferrer" className={link}>
          {title}
        </a>
        {active.tab !== null && (
          <>
            {" › "}
            {tabUrl === null ? (
              <span className="font-mono">{active.tab}</span>
            ) : (
              <a href={tabUrl} target="_blank" rel="noreferrer" className={`${link} font-mono`}>
                {active.tab}
              </a>
            )}
          </>
        )}
      </p>
      {active.tab === null && (
        <p className="text-amber-800 dark:text-amber-300">No tab set. Scanning is disabled until one is set.</p>
      )}
      <form action={fetchDetails}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          {pending ? "Fetching…" : fetchLabel}
        </button>
      </form>
      {details && !details.reachable && (
        <p role="alert" className="text-amber-800 dark:text-amber-300">{details.message}</p>
      )}
      {details?.reachable && (
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

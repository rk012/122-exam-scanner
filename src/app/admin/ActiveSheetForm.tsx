"use client";

import { useActionState, type MouseEvent } from "react";
import { clearActiveSheetAction, clearActiveTabAction, setActiveSheetAction, type SetSheetResult } from "./actions";

export function ActiveSheetForm({ current }: { current: { spreadsheetId: string; tab: string | null } | null }) {
  const [result, action, pending] = useActionState<SetSheetResult | null, FormData>(setActiveSheetAction, null);
  const input = "rounded-md border border-neutral-300 bg-transparent px-3 py-2 font-mono text-sm dark:border-neutral-700";
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Spreadsheet URL or ID
        <input name="spreadsheet" required defaultValue={current?.spreadsheetId ?? ""} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Tab name (tonight&apos;s copy of TEMPLATE tab)
        <input name="tab" defaultValue={current?.tab ?? ""} placeholder="Exam 1" className={input} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {pending ? "Checking…" : "Check and save"}
      </button>
      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
          {result.message}
        </p>
      )}
    </form>
  );
}

const clearButton = "text-xs text-red-700 underline dark:text-red-400";

/** Each clear stops scanning until a tab is set again, so it asks first. */
export function ClearActiveSheetButtons({ hasTab }: { hasTab: boolean }) {
  const confirmFirst = (what: string) => (e: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(`Clear the ${what}? In-app scanning is disabled until a tab is set again.`)) e.preventDefault();
  };
  return (
    <div className="flex gap-4">
      {hasTab && (
        <form action={clearActiveTabAction}>
          <button type="submit" onClick={confirmFirst("tab")} className={clearButton}>
            Clear tab
          </button>
        </form>
      )}
      <form action={clearActiveSheetAction}>
        <button type="submit" onClick={confirmFirst("spreadsheet")} className={clearButton}>
          Clear spreadsheet
        </button>
      </form>
    </div>
  );
}

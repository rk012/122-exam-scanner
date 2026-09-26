import { isQa } from "@/lib/build";

/** Renders the QA badge on QA builds and nothing on Prod. */
export function QaBadge() {
  if (!isQa) return null;
  return (
    <span
      className="inline-flex items-center rounded-md border border-amber-500 bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      title="QA deployment: pointed at the fake-roster spreadsheet"
    >
      QA
    </span>
  );
}

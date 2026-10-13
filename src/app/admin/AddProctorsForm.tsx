"use client";

import { useActionState } from "react";
import { addProctorsAction, type AddResult } from "./actions";

export function AddProctorsForm() {
  const [result, action, pending] = useActionState<AddResult | null, FormData>(
    addProctorsAction,
    null,
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="andrewIds" className="text-sm font-medium">
        Add proctors
      </label>
      <textarea
        id="andrewIds"
        name="andrewIds"
        required
        rows={3}
        placeholder="Andrew IDs, separated by commas or newlines"
        className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 font-mono text-sm dark:border-neutral-700"
      />
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      {result && (
        <ul className="text-xs text-neutral-600 dark:text-neutral-400" role="status">
          {result.added.length > 0 && <li>Added: {result.added.join(", ")}</li>}
          {result.alreadyPresent.length > 0 && (
            <li>Already on the list: {result.alreadyPresent.join(", ")}</li>
          )}
          {result.invalid.length > 0 && (
            <li className="text-red-700 dark:text-red-400">
              Not valid Andrew IDs (skipped): {result.invalid.join(", ")}
            </li>
          )}
        </ul>
      )}
    </form>
  );
}

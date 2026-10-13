"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { addProctorsAction, removeProctorAction, type AddResult } from "./actions";

/**
 * Proctor list plus add/remove. The list lives here and is replaced with what
 * each action returns, so an edit doesn't re-render the rest of /admin.
 */
export function ProctorsSection({ initial }: { initial: string[] }) {
  const [proctors, setProctors] = useState(initial);
  const [result, add, adding] = useActionState<AddResult | null, FormData>(async (prev, formData) => {
    const next = await addProctorsAction(prev, formData);
    setProctors(next.proctors);
    return next;
  }, null);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-medium text-neutral-500">Proctors ({proctors.length})</h3>
      <form action={add} className="flex flex-col gap-2">
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
          disabled={adding}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {adding ? "Adding…" : "Add"}
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
      {proctors.length === 0 ? (
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
              {proctors.map((andrewId) => (
                <tr key={andrewId} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-1.5 pr-4 font-mono">{andrewId}</td>
                  <td className="py-1.5 text-right">
                    <form action={async (formData) => setProctors(await removeProctorAction(formData))}>
                      <input type="hidden" name="andrewId" value={andrewId} />
                      <RemoveButton andrewId={andrewId} />
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RemoveButton({ andrewId }: { andrewId: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-red-700 underline disabled:opacity-50 dark:text-red-400"
      aria-label={`Remove ${andrewId}`}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}

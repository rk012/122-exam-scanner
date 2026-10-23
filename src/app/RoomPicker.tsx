"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ScanApiErrorNotice } from "@/components/ScanApiErrorNotice";
import { fetchRooms, type ApiResult, type RoomsResponse } from "@/lib/scan/client";
import type { RoomOption } from "@/lib/scan/outcome";

/** Tonight's rooms from the active sheet, grouped by timeslot. Each links to its scan page. */
export function RoomPicker() {
  const [result, setResult] = useState<ApiResult<RoomsResponse> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetchRooms().then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => {
    setResult(null);
    setAttempt((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Pick your room</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {result?.ok ? result.data.tab : "Check-in sheet"}
        </p>
      </div>

      {result === null && <p className="text-sm text-neutral-500">Loading rooms…</p>}
      {result?.ok === false && <ScanApiErrorNotice error={result.error} onRetry={retry} />}
      {result?.ok &&
        byTimeslot(result.data.rooms).map(([timeslot, rooms]) => (
          <section key={timeslot}>
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">{timeslot}</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {rooms.map((r) => (
                <li key={r.code}>
                  <Link
                    href={`/scan/${encodeURIComponent(r.code)}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-300 px-4 py-3 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  >
                    <span className="font-medium">{r.name}</span>
                    <span className="text-sm text-neutral-500">
                      {r.capacity !== null && `${r.capacity} seats · `}
                      <span className="font-mono">{r.code}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

      {result?.ok && (
        <p className="text-xs text-neutral-500">
          Packets that belong to any other room or timeslot are flagged, not checked.
        </p>
      )}
    </div>
  );
}

/** Groups rooms by timeslot, keeping the sheet's left-to-right order. */
function byTimeslot(rooms: RoomOption[]): [string, RoomOption[]][] {
  const groups = new Map<string, RoomOption[]>();
  for (const r of rooms) {
    const group = groups.get(r.timeslot);
    if (group) group.push(r);
    else groups.set(r.timeslot, [r]);
  }
  return [...groups];
}

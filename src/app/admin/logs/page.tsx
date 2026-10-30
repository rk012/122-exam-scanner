import Link from "next/link";
import { getDb } from "@/db";
import type { ScanEvent } from "@/db/schema";
import { listScanEvents } from "@/lib/scan/log";
import { FLAGS, type FlagCode } from "@/lib/scan/outcome";
import { superadminGate } from "../gate";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

// Exams happen in Pittsburgh, so show its time whatever zone the server runs in.
const TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

interface Filter {
  exam?: string;
  room?: string;
  ta?: string;
}

function param(v: string | string[] | undefined): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 32) : undefined;
}

function logHref(filter: Filter, before?: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) q.set(k, v);
  if (before !== undefined) q.set("before", String(before));
  const s = q.toString();
  return s ? `/admin/logs?${s}` : "/admin/logs";
}

export default async function ScanLogPage({ searchParams }: PageProps<"/admin/logs">) {
  const denied = await superadminGate();
  if (denied) return denied;

  const params = await searchParams;
  const filter: Filter = {
    exam: param(params.exam),
    room: param(params.room)?.toUpperCase(),
    ta: param(params.ta)?.toLowerCase(),
  };
  const before = Number(param(params.before));
  const beforeId = Number.isSafeInteger(before) && before > 0 ? before : undefined;
  const rows = await listScanEvents(getDb(), {
    examNumber: filter.exam,
    roomCode: filter.room,
    taAndrewId: filter.ta,
    beforeId,
    limit: PAGE_SIZE + 1,
  });
  const events = rows.slice(0, PAGE_SIZE);
  const olderThan = rows.length > PAGE_SIZE ? events[events.length - 1].id : undefined;
  const filtered = Boolean(filter.exam || filter.room || filter.ta);
  const input = "w-28 rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 font-mono text-sm dark:border-neutral-700";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin" className="text-sm underline">
          ← Admin
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{filter.exam ? `Trace exam ${filter.exam}` : "Scan log"}</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Every lookup and confirm the app has seen, newest first. A checked box also appears in the
          sheet&apos;s own edit history for that cell, under the TA who checked it.
        </p>
      </div>

      <form action="/admin/logs" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
          Exam #
          <input name="exam" defaultValue={filter.exam} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
          Room
          <input name="room" defaultValue={filter.room} placeholder="A1" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
          TA
          <input name="ta" defaultValue={filter.ta} placeholder="Andrew ID" className={input} />
        </label>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Filter
        </button>
        {filtered && (
          <Link href="/admin/logs" className="py-1.5 text-sm underline">
            Clear
          </Link>
        )}
      </form>

      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">{filtered ? "No scans match." : "No scans yet."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 pr-4 font-medium">Time</th>
                <th className="py-1 pr-4 font-medium">Exam #</th>
                <th className="py-1 pr-4 font-medium">Room</th>
                <th className="py-1 pr-4 font-medium">TA</th>
                <th className="py-1 pr-4 font-medium">Action</th>
                <th className="py-1 pr-4 font-medium">Outcome</th>
                <th className="py-1 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <EventRow key={e.id} event={e} filter={filter} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(beforeId !== undefined || olderThan !== undefined) && (
        <div className="flex gap-4 text-sm">
          {beforeId !== undefined && (
            <Link href={logHref(filter)} className="underline">
              Newest
            </Link>
          )}
          {olderThan !== undefined && (
            <Link href={logHref(filter, olderThan)} className="underline">
              Older →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function EventRow({ event: e, filter }: { event: ScanEvent; filter: Filter }) {
  const link = "underline decoration-neutral-300 hover:decoration-current dark:decoration-neutral-700";
  return (
    <tr className="border-t border-neutral-200 align-top dark:border-neutral-800">
      <td className="whitespace-nowrap py-1.5 pr-4 text-neutral-600 dark:text-neutral-400">
        {TIME.format(e.createdAt)}
      </td>
      <td className="py-1.5 pr-4 font-mono">
        <Link href={logHref({ exam: e.examNumber })} className={link}>
          {e.examNumber}
        </Link>
      </td>
      <td className="py-1.5 pr-4 font-mono">
        <Link href={logHref({ ...filter, room: e.roomCode })} className={link}>
          {e.roomCode}
        </Link>
      </td>
      <td className="py-1.5 pr-4 font-mono">
        <Link href={logHref({ ...filter, ta: e.taAndrewId })} className={link}>
          {e.taAndrewId}
        </Link>
      </td>
      <td className="py-1.5 pr-4">{e.action}</td>
      <td className="py-1.5 pr-4">
        <OutcomeBadge outcome={e.outcome} />
      </td>
      <td className="py-1.5 font-mono text-xs text-neutral-600 dark:text-neutral-400">{e.detail}</td>
    </tr>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const title = outcome in FLAGS ? FLAGS[outcome as FlagCode].title : undefined;
  const color =
    outcome === "checked"
      ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"
      : outcome === "match"
        ? "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
        : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return (
    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${color}`} title={title}>
      {outcome}
    </span>
  );
}

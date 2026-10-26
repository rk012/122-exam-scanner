"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ScanApiErrorNotice } from "@/components/ScanApiErrorNotice";
import {
  confirmExam,
  fetchRooms,
  lookupExam,
  type ApiError,
  type ApiResult,
  type RoomsResponse,
} from "@/lib/scan/client";
import type { RoomOption, ScanOutcome } from "@/lib/scan/outcome";

type Match = Extract<ScanOutcome, { status: "match" }>;
type Flagged = Extract<ScanOutcome, { status: "flagged" }>;

type Step =
  | { kind: "entry" }
  /** Waiting for the proctor to compare the Andrew ID with the packet. */
  | { kind: "match"; match: Match }
  | { kind: "flagged"; flagged: Flagged; at: Date };

/** One line of the recent-scans list. */
interface RecentScan {
  id: number;
  examNumber: string;
  at: Date;
  kind: "checked" | "flagged" | "skipped";
  /** The Andrew ID, or the flag's title. */
  text: string;
}

const RECENT_LIMIT = 5;

/** Loads the room from the active sheet, then scans packets into it. */
export function Scanner({ roomCode }: { roomCode: string }) {
  const [rooms, setRooms] = useState<ApiResult<RoomsResponse> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetchRooms().then((r) => live && setRooms(r));
    return () => {
      live = false;
    };
  }, [attempt]);

  if (rooms === null) return <p className="text-sm text-neutral-500">Loading room…</p>;
  if (!rooms.ok) {
    const retry = () => {
      setRooms(null);
      setAttempt((n) => n + 1);
    };
    return <ScanApiErrorNotice error={rooms.error} onRetry={retry} />;
  }
  const room = rooms.data.rooms.find((r) => r.code === roomCode);
  if (!room) {
    return (
      <p className="text-sm">
        Room <span className="font-mono">{roomCode}</span> is not on tonight&apos;s sheet.{" "}
        <Link href="/" className="underline">
          Pick a room
        </Link>
      </p>
    );
  }
  return <ScanSession room={room} />;
}

function ScanSession({ room }: { room: RoomOption }) {
  const [step, setStep] = useState<Step>({ kind: "entry" });
  const [examNumber, setExamNumber] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [lastChecked, setLastChecked] = useState<RecentScan | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const nextId = useRef(0);

  function remember(scan: Omit<RecentScan, "id" | "at">): RecentScan {
    const entry = { ...scan, id: nextId.current++, at: new Date() };
    setRecent((r) => [entry, ...r].slice(0, RECENT_LIMIT));
    return entry;
  }

  function showFlag(flagged: Flagged) {
    const entry = remember({ examNumber: flagged.examNumber, kind: "flagged", text: flagged.flag.title });
    setStep({ kind: "flagged", flagged, at: entry.at });
  }

  function backToEntry() {
    setError(null);
    setStep({ kind: "entry" });
  }

  async function lookup(e: FormEvent) {
    e.preventDefault();
    const wanted = examNumber.trim();
    if (wanted === "" || pending) return;
    setPending(true);
    setError(null);
    setLastChecked(null);
    const res = await lookupExam(wanted, room.code);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setExamNumber("");
    if (res.data.status === "match") setStep({ kind: "match", match: res.data });
    else showFlag(res.data);
  }

  async function confirm(match: Match) {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await confirmExam(match.examNumber, room.code);
    setPending(false);
    if (!res.ok) {
      setError(confirmFailure(res.error));
      return;
    }
    if (res.data.status === "checked") {
      setLastChecked(remember({ examNumber: res.data.examNumber, kind: "checked", text: res.data.andrewId }));
      backToEntry();
    } else {
      showFlag(res.data);
    }
  }

  function skip(match: Match) {
    remember({ examNumber: match.examNumber, kind: "skipped", text: match.andrewId });
    backToEntry();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{room.timeslot}</p>
          <h1 className="text-2xl font-semibold">
            {room.name} <span className="font-mono text-base font-normal text-neutral-500">{room.code}</span>
          </h1>
        </div>
        <Link href="/" className="shrink-0 pt-1 text-sm underline">
          Change room
        </Link>
      </div>

      {step.kind === "entry" && (
        <>
          {lastChecked && (
            <p
              role="status"
              className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
            >
              ✓ Box checked for <span className="font-mono font-semibold">{lastChecked.examNumber}</span> (
              <span className="font-mono">{lastChecked.text}</span>). Scan the next packet.
            </p>
          )}
          {error && <ScanApiErrorNotice error={error} />}
          <form onSubmit={lookup} className="flex flex-col gap-3">
            <label htmlFor="exam-number" className="text-sm font-medium">
              Exam number
            </label>
            <input
              id="exam-number"
              value={examNumber}
              onChange={(e) => setExamNumber(e.target.value)}
              inputMode="numeric"
              enterKeyHint="go"
              autoComplete="off"
              maxLength={32}
              autoFocus
              className="rounded-lg border border-neutral-300 bg-transparent px-4 py-3 font-mono text-2xl dark:border-neutral-700"
            />
            <button
              type="submit"
              disabled={pending || examNumber.trim() === ""}
              className="rounded-lg bg-neutral-900 px-4 py-3 text-base font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {pending ? "Looking up…" : "Look up"}
            </button>
          </form>
        </>
      )}

      {step.kind === "match" && (
        <ConfirmMatch
          match={step.match}
          pending={pending}
          error={error}
          onConfirm={() => confirm(step.match)}
          onSkip={() => skip(step.match)}
        />
      )}

      {step.kind === "flagged" && <FlagCard flagged={step.flagged} at={step.at} onContinue={backToEntry} />}

      <RecentScans scans={recent} />
    </div>
  );
}

/**
 * A confirm that failed in transit may still have written the box. Retrying
 * is safe because confirm re-checks the sheet first.
 */
function confirmFailure(e: ApiError): ApiError {
  if (e.error !== "network" && e.error !== "server") return e;
  return {
    ...e,
    message: "An error occurred, try again.",
  };
}

function ConfirmMatch(props: {
  match: Match;
  pending: boolean;
  error: ApiError | null;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const { match, pending, error } = props;
  const label = "text-xs font-medium uppercase tracking-wide text-neutral-500";
  return (
    <section className="flex flex-col gap-5 rounded-xl border border-neutral-300 p-5 dark:border-neutral-700">
      <dl className="flex flex-col gap-4">
        <div>
          <dt className={label}>Exam #</dt>
          <dd className="font-mono text-4xl font-semibold">{match.examNumber}</dd>
        </div>
        <div>
          <dt className={label}>Andrew ID</dt>
          <dd className="break-all font-mono text-4xl font-semibold">{match.andrewId}</dd>
        </div>
      </dl>
      <p className="text-base font-medium">Confirm that the Andrew ID matches</p>
      {error && <ScanApiErrorNotice error={error} />}
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <button
          type="button"
          onClick={props.onSkip}
          disabled={pending}
          className="rounded-lg border border-neutral-300 px-4 py-4 text-base font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          ✕ Skip
        </button>
        <button
          type="button"
          onClick={props.onConfirm}
          disabled={pending}
          className="rounded-lg bg-green-700 px-4 py-4 text-base font-semibold text-white hover:bg-green-800 disabled:opacity-50"
        >
          {pending ? "Checking…" : "✓ Check the box"}
        </button>
      </div>
    </section>
  );
}

function FlagCard({ flagged, at, onContinue }: { flagged: Flagged; at: Date; onContinue: () => void }) {
  return (
    <section
      role="alert"
      className="flex flex-col gap-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-5 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="text-xs font-medium uppercase tracking-wide">
        Flagged · {formatTime(at)}
      </p>
      <p className="font-mono text-2xl font-semibold">{flagged.examNumber}</p>
      <h2 className="text-xl font-semibold">{flagged.flag.title}</h2>
      <p className="text-sm">{flagged.flag.body}</p>
      {flagged.belongsTo && (
        <p className="text-sm">
          Belongs to <span className="font-mono font-semibold">{flagged.belongsTo.code}</span> ·{" "}
          {flagged.belongsTo.room}
        </p>
      )}
      <button
        type="button"
        onClick={onContinue}
        autoFocus
        className="mt-2 rounded-lg bg-neutral-900 px-4 py-3 text-base font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Continue scanning
      </button>
    </section>
  );
}

const KIND_MARK: Record<RecentScan["kind"], { mark: string; label: string; className: string }> = {
  checked: { mark: "✓", label: "Checked", className: "text-green-700 dark:text-green-400" },
  flagged: { mark: "!", label: "Flagged", className: "text-amber-700 dark:text-amber-400" },
  skipped: { mark: "✕", label: "Skipped", className: "text-neutral-500" },
};

function RecentScans({ scans }: { scans: RecentScan[] }) {
  if (scans.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Recent scans</h2>
      <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
        {scans.map((s) => {
          const kind = KIND_MARK[s.kind];
          return (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <span className={`w-4 text-center font-semibold ${kind.className}`} aria-hidden>
                {kind.mark}
              </span>
              <span className="sr-only">{kind.label}</span>
              <span className="w-20 shrink-0 font-mono">{s.examNumber}</span>
              <span className={`min-w-0 flex-1 truncate ${s.kind === "flagged" ? "" : "font-mono"}`}>{s.text}</span>
              <time className="shrink-0 text-xs text-neutral-500">{formatTime(s.at)}</time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

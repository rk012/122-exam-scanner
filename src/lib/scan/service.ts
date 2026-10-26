/**
 * The scanning backend, independent of HTTP. API routes are thin wrappers
 * around these two functions. Every outcome is appended to the scan log.
 */

import type { Db } from "@/db";
import type { CheckinSheet, ExamLookup, RoomBlock } from "@/lib/sheets";
import { recordScanEvent } from "./log";
import { flagged, type ConfirmOutcome, type RoomOption, type RoomRef, type ScanOutcome } from "./outcome";

const ANDREW_ID_RE = /^[a-z0-9]{1,32}$/;

export function roomRef(block: RoomBlock): RoomRef {
  return { code: block.code, room: block.room };
}

/**
 * Determines scan outcome from exam number, sheeets lookup result, and expected room code
 */
function evaluateScan(examNumber: string, lookup: ExamLookup, selectedRoomCode: string): ScanOutcome {
  if (lookup.kind === "not-found") return flagged("not-in-sheet", examNumber);
  if (lookup.kind === "duplicate") return flagged("duplicate", examNumber);

  const { row } = lookup;
  if (row.block.code !== selectedRoomCode) {
    return flagged("wrong-room", examNumber, roomRef(row.block));
  }
  if (row.andrewId === null) return flagged("no-andrew-id", examNumber);
  if (!ANDREW_ID_RE.test(row.andrewId)) return flagged("row-malformed", examNumber);
  if (row.gotPaper) return flagged("already-collected", examNumber);

  return {
    status: "match",
    examNumber: row.examNumber ?? examNumber,
    andrewId: row.andrewId,
    room: roomRef(row.block),
  };
}

export interface ScanContext {
  db: Db;
  sheet: CheckinSheet;
  /** The proctoring TA. */
  taAndrewId: string;
  /** Room the proctor picked before scanning. */
  roomCode: string;
}

/** Look the packet up and decide, writing nothing to the sheet. */
export async function lookupScan(ctx: ScanContext, examNumber: string): Promise<ScanOutcome> {
  const lookup = await ctx.sheet.findExam(examNumber);
  const outcome = evaluateScan(examNumber, lookup, ctx.roomCode);
  await recordScanEvent(ctx.db, {
    examNumber,
    roomCode: ctx.roomCode,
    taAndrewId: ctx.taAndrewId,
    action: "lookup",
    outcome: outcome.status === "match" ? "match" : outcome.code,
    detail: outcome.status === "flagged" && outcome.belongsTo ? `belongs to ${outcome.belongsTo.code}` : undefined,
  });
  return outcome;
}

/**
 * The proctor confirmed the Andrew ID matches the packet. Re-run every check
 * against the live sheet (it may have changed since the lookup), then write
 * exactly one checkbox.
 */
export async function confirmScan(ctx: ScanContext, examNumber: string): Promise<ConfirmOutcome> {
  const lookup = await ctx.sheet.findExam(examNumber);
  const outcome = evaluateScan(examNumber, lookup, ctx.roomCode);
  if (outcome.status === "flagged") {
    await recordScanEvent(ctx.db, {
      examNumber,
      roomCode: ctx.roomCode,
      taAndrewId: ctx.taAndrewId,
      action: "confirm",
      outcome: outcome.code,
      detail: "no write attempted",
    });
    return outcome;
  }
  // evaluateScan only returns "match" for a found row, so this is safe.
  const row = (lookup as Extract<typeof lookup, { kind: "found" }>).row;
  const write = await ctx.sheet.setGotPaper(row, true);
  if (write.kind === "refused") {
    // row-changed / layout-changed: the sheet was edited between lookup and
    // write. Hand it to the proctor rather than retrying on our own.
    const code = write.reason === "already-collected" ? "already-collected" : "row-malformed";
    await recordScanEvent(ctx.db, {
      examNumber,
      roomCode: ctx.roomCode,
      taAndrewId: ctx.taAndrewId,
      action: "confirm",
      outcome: code,
      detail: `write refused: ${write.detail}`,
    });
    return flagged(code, examNumber);
  }
  await recordScanEvent(ctx.db, {
    examNumber,
    roomCode: ctx.roomCode,
    taAndrewId: ctx.taAndrewId,
    action: "confirm",
    outcome: "checked",
    detail: write.range,
  });
  return { status: "checked", examNumber: outcome.examNumber, andrewId: outcome.andrewId, room: outcome.room };
}

/**
 * Rooms a proctor can pick from, straight from the sheet's layout, plus the
 * tab name (tonight's exam, e.g. "Exam 1").
 */
export async function listRooms(sheet: CheckinSheet): Promise<{ tab: string; rooms: RoomOption[] } | { error: string }> {
  const result = await sheet.reloadLayout();
  if (!result.reachable) return { error: result.error };
  if (!result.layout.ok) return { error: result.summary };
  return {
    tab: sheet.tab,
    rooms: result.layout.blocks.map((b) => ({ ...roomRef(b), name: b.name, timeslot: b.timeslot, capacity: b.capacity })),
  };
}

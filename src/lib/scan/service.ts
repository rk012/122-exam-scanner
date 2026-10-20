/**
 * The scanning backend, independent of HTTP. API routes are thin wrappers
 * around these two functions.
 */

import type { CheckinSheet, ExamLookup, RoomBlock } from "@/lib/sheets";
import { flagged, type ConfirmOutcome, type RoomRef, type ScanOutcome } from "./outcome";

const ANDREW_ID_RE = /^[a-z0-9]{1,32}$/;

export function roomRef(block: RoomBlock): RoomRef {
  return { code: block.code, room: block.room };
}

/**
 * Pure decision: given what the sheet says about an exam number and which
 * room the proctor selected, decide match vs. flag. Ordered so the most
 * actionable reason wins: a packet in the wrong room is handed off before we
 * bother about its Andrew ID; a row with no Andrew ID is flagged before the
 * checkbox is considered, because the proctor must verify by ID card first.
 *
 * There is deliberately no section check. The block a student's row sits in
 * already reflects permanent and one-time swaps, so a student whose section
 * isn't in the block's "Sections:" list is usually a swap, not a mistake.
 * Which room the row is in (the wrong-room check) is the authoritative test.
 */
export function evaluateScan(examNumber: string, lookup: ExamLookup, selectedRoomCode: string): ScanOutcome {
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
  sheet: CheckinSheet;
  /** Room the proctor picked before scanning. */
  roomCode: string;
}

/** Look the packet up and decide, writing nothing to the sheet. */
export async function lookupScan(ctx: ScanContext, examNumber: string): Promise<ScanOutcome> {
  const lookup = await ctx.sheet.findExam(examNumber);
  return evaluateScan(examNumber, lookup, ctx.roomCode);
}

/**
 * The proctor confirmed the Andrew ID matches the packet. Re-run every check
 * against the live sheet (it may have changed since the lookup), then write
 * exactly one checkbox.
 */
export async function confirmScan(ctx: ScanContext, examNumber: string): Promise<ConfirmOutcome> {
  const lookup = await ctx.sheet.findExam(examNumber);
  const outcome = evaluateScan(examNumber, lookup, ctx.roomCode);
  if (outcome.status === "flagged") return outcome;
  // evaluateScan only returns "match" for a found row, so this is safe.
  const row = (lookup as Extract<typeof lookup, { kind: "found" }>).row;
  const write = await ctx.sheet.setGotPaper(row, true);
  if (write.kind === "refused") {
    // row-changed / layout-changed: the sheet was edited between lookup and
    // write. Hand it to the proctor rather than retrying on our own.
    return flagged(write.reason === "already-collected" ? "already-collected" : "row-malformed", examNumber);
  }
  return { status: "checked", examNumber: outcome.examNumber, andrewId: outcome.andrewId, room: outcome.room };
}

/** Rooms a proctor can pick from, straight from the sheet's layout. */
export async function listRooms(sheet: CheckinSheet): Promise<{ rooms: (RoomRef & { capacity: number | null })[] } | { error: string }> {
  const result = await sheet.reloadLayout();
  if (!result.reachable) return { error: result.error };
  if (!result.layout.ok) return { error: result.summary };
  return { rooms: result.layout.blocks.map((b) => ({ ...roomRef(b), capacity: b.capacity })) };
}

/**
 * The scanning backend, independent of HTTP. API routes are thin wrappers
 * around these two functions.
 */

import type { CheckinSheet } from "@/lib/sheets";
import { evaluateScan, roomRef } from "./evaluate";
import { flagged, type ConfirmOutcome, type RoomRef, type ScanOutcome } from "./outcome";

export interface ScanContext {
  sheet: CheckinSheet;
  /** Room the proctor picked before scanning. */
  roomCode: string;
}

export function normalizeScannedExamNumber(raw: string): string | null {
  const s = raw.trim();
  return s.length > 0 && s.length <= 32 ? s : null;
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

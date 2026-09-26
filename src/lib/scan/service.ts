/**
 * The scanning backend, independent of HTTP. API routes are thin wrappers
 * around these two functions. Every outcome is appended to the scan log.
 */

import type { Db } from "@/db";
import type { CheckinSheet } from "@/lib/sheets";
import { evaluateScan, roomRef } from "./evaluate";
import { recordScanEvent } from "./log";
import { flagged, type ConfirmOutcome, type RoomRef, type ScanOutcome } from "./outcome";

export interface ScanContext {
  db: Db;
  sheet: CheckinSheet;
  /** The proctoring TA. */
  taAndrewId: string;
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

/** Rooms a proctor can pick from, straight from the sheet's layout. */
export async function listRooms(sheet: CheckinSheet): Promise<{ rooms: (RoomRef & { capacity: number | null })[] } | { error: string }> {
  const result = await sheet.inspect();
  if (!result.reachable) return { error: result.error };
  if (!result.layout.ok) return { error: result.summary };
  return { rooms: result.layout.blocks.map((b) => ({ ...roomRef(b), capacity: b.capacity })) };
}

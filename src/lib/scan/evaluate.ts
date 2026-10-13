import type { ExamLookup, RoomBlock } from "@/lib/sheets";
import { flagged, type RoomRef, type ScanOutcome } from "./outcome";

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

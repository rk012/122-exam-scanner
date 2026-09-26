import type { ExamLookup } from "@/lib/sheets";
import type { RoomBlock } from "@/lib/sheets";
import { flagged, type RoomRef, type ScanOutcome } from "./outcome";

const ANDREW_ID_RE = /^[a-z0-9]{1,32}$/;

export function roomRef(block: RoomBlock): RoomRef {
  return { code: block.code, room: block.room, timeslot: block.timeslot };
}

/**
 * Pure decision: given what the sheet says about an exam number and which
 * room the proctor selected, decide match vs. flag. Ordered so the most
 * actionable reason wins: a packet in the wrong room is handed off before we
 * bother about its Andrew ID; a row with no Andrew ID is flagged before the
 * checkbox is considered, because the proctor must verify by ID card first.
 */
export function evaluateScan(
  examNumber: string,
  lookup: ExamLookup,
  selectedRoomCode: string,
): ScanOutcome {
  if (lookup.kind === "not-found") return flagged("not-in-sheet", examNumber);
  if (lookup.kind === "duplicate") return flagged("duplicate", examNumber);

  const { row } = lookup;
  const block = row.block;

  if (block.code !== selectedRoomCode) {
    return flagged("wrong-room", examNumber, roomRef(block));
  }

  if (row.andrewId !== null && !ANDREW_ID_RE.test(row.andrewId)) {
    return flagged("row-malformed", examNumber);
  }
  if (row.andrewId === null) return flagged("no-andrew-id", examNumber);

  if (block.sections !== "various") {
    if (row.section === null) return flagged("row-malformed", examNumber);
    if (block.sections === null || !block.sections.includes(row.section)) {
      return flagged("wrong-section", examNumber);
    }
  }

  if (row.gotPaper) return flagged("already-collected", examNumber);

  return {
    status: "match",
    examNumber: row.examNumber ?? examNumber,
    andrewId: row.andrewId,
    room: roomRef(block),
  };
}

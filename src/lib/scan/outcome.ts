/**
 * Possible scan results + messages surfaced to user.
 */

export type FlagCode =
  | "already-collected"
  | "wrong-room"
  | "no-andrew-id"
  | "not-in-sheet"
  | "duplicate"
  | "row-malformed";

export interface FlagText {
  title: string;
  body: string;
}

export const FLAGS: Record<FlagCode, FlagText> = {
  "already-collected": {
    title: "Already collected",
    body: "The box for this exam number is already checked.",
  },
  "wrong-room": {
    title: "Wrong room",
    body: "This exam number belongs to another room or timeslot.",
  },
  "no-andrew-id": {
    title: "No Andrew ID on the row",
    body: "The sheet row for this exam number has no Andrew ID.",
  },
  "not-in-sheet": {
    title: "Not in this sheet",
    body: "This exam number is not in the sheet.",
  },
  "duplicate": {
    title: "Not found or found twice",
    body: "This exam number appears multiple times.",
  },
  "row-malformed": {
    title: "Row malformed",
    body: "Could not read row from google sheets for this exam",
  },
};

export interface RoomRef {
  /** e.g. "A1". */
  code: string;
  /** Room name and timeslot as the sheet shows them, e.g. "DH 2210, 7:00 - 7:35pm". */
  room: string;
}

/** Result of a lookup: either a candidate for the human confirm step, or a flag. */
export type ScanOutcome =
  | {
    status: "match";
    examNumber: string;
    andrewId: string;
    room: RoomRef;
  }
  | {
    status: "flagged";
    code: FlagCode;
    flag: FlagText;
    examNumber: string;
    /** For wrong-room only: where the packet belongs. Never student data. */
    belongsTo?: RoomRef;
  };

/** Result of a confirm: the write happened, or it was refused with a flag. */
export type ConfirmOutcome =
  | { status: "checked"; examNumber: string; andrewId: string; room: RoomRef }
  | Extract<ScanOutcome, { status: "flagged" }>;

export function flagged(
  code: FlagCode,
  examNumber: string,
  belongsTo?: RoomRef,
): Extract<ScanOutcome, { status: "flagged" }> {
  return belongsTo
    ? { status: "flagged", code, flag: FLAGS[code], examNumber, belongsTo }
    : { status: "flagged", code, flag: FLAGS[code], examNumber };
}

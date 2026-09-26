/**
 * What a scan can result in, and the exact words the proctor sees. Mirrors the
 * flag table in the design: one title, one sentence of context, one action.
 * The box stays unchecked for every flag.
 */

export type FlagCode =
  | "already-collected"
  | "wrong-room"
  | "no-andrew-id"
  | "not-in-sheet"
  | "duplicate"
  | "wrong-section"
  | "row-malformed";

export interface FlagText {
  title: string;
  body: string;
  action: string;
}

export const FLAGS: Record<FlagCode, FlagText> = {
  "already-collected": {
    title: "Already collected",
    body: "The box for this exam number is already checked. This may be a double scan.",
    action: "Set aside, keep scanning",
  },
  "wrong-room": {
    title: "Wrong room",
    body: "This exam number belongs to another room or timeslot.",
    action: "Hand to that room's proctor",
  },
  "no-andrew-id": {
    title: "No Andrew ID on the row",
    body: "The sheet row for this exam number has no Andrew ID.",
    action: "Verify the student's ID card, then check the box in the sheet yourself",
  },
  "not-in-sheet": {
    title: "Not in this sheet",
    body: "This exam number is not in tonight's sheet, in any room.",
    action: "Set aside for a head TA (misread digit or packet from another night)",
  },
  duplicate: {
    title: "Not found or found twice",
    body: "This exam number appears on more than one row.",
    action: "Hand to a head TA",
  },
  "wrong-section": {
    title: "Wrong section",
    body: "The student's section is not one this room proctors.",
    action: "Hand back",
  },
  "row-malformed": {
    title: "Row malformed",
    body: "The sheet row for this exam number is missing data or is not laid out as expected.",
    action: "Enter manually",
  },
};

export interface RoomRef {
  code: string;
  room: string;
  timeslot: string;
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

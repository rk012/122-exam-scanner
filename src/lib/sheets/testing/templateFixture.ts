/**
 * Builds a grid shaped like the TEMPLATE tab of the check-in spreadsheet:
 * six regular room blocks, an Accom block, and a Makeup block, each with the
 * real header rows. Student rows are filled from `students`.
 */
import type { CellValue } from "../api";
import { columnIndex } from "../a1";
import type { Grid } from "./fakeSheetsApi";

export interface FixtureStudent {
  /** Room code, e.g. "A1". */
  code: string;
  andrewId?: CellValue;
  section?: string;
  examNumber?: CellValue;
  gotPaper?: boolean;
  /** Optional explicit sheet row (1-based). Defaults to next free row in the block. */
  row?: number;
}

export interface FixtureBlock {
  startCol: string;
  room: string;
  code: string;
  timeslot: string;
  capacity?: number;
  sectionsCell: string;
  headers: string[];
}

export const REGULAR_HEADERS = ["First name", "Last name", "Andrew id", "Section", "Exam #", "Seat #", "Got paper", "Notes"];
export const ACCOM_HEADERS = ["First name", "Last name", "Andrew id", "Section", "Exam #", "Seat #", "Got paper", "Extra", "Extra mins", "Finish time", "Notes"];
export const MAKEUP_HEADERS = ["Andrew id", "Section", "Cause", "Remedy", "extra", "Sched", "Taken"];

export const TEMPLATE_BLOCKS: FixtureBlock[] = [
  { startCol: "A", room: "DH 2210", code: "A1", timeslot: "7:00 - 7:35pm", capacity: 124, sectionsCell: "Sections: B, C, H, I, S", headers: REGULAR_HEADERS },
  { startCol: "J", room: "DH 2315", code: "B1", timeslot: "7:00 - 7:35pm", capacity: 114, sectionsCell: "#N/A", headers: REGULAR_HEADERS },
  { startCol: "S", room: "GHC 4401", code: "C1", timeslot: "7:00 - 7:35pm", capacity: 122, sectionsCell: "Sections: J, O, P, Q", headers: REGULAR_HEADERS },
  { startCol: "AB", room: "DH 2210", code: "A2", timeslot: "7:45 - 8:20pm", capacity: 124, sectionsCell: "Sections: A, D, E, F, G", headers: REGULAR_HEADERS },
  { startCol: "AK", room: "DH 2315", code: "B2", timeslot: "7:45 - 8:20pm", capacity: 114, sectionsCell: "#N/A", headers: REGULAR_HEADERS },
  { startCol: "AT", room: "GHC 4401", code: "C2", timeslot: "7:45 - 8:20pm", capacity: 122, sectionsCell: "Sections: K, L, M, N", headers: REGULAR_HEADERS },
  { startCol: "BC", room: "Accom", code: "D1", timeslot: "7:00 - 8:10pm", sectionsCell: "Sections: (various)", headers: ACCOM_HEADERS },
];
export const MAKEUP_START = "BO";

export interface BuildOptions {
  tabLabel?: string;
  students?: FixtureStudent[];
  blocks?: FixtureBlock[];
  /** Mutate the finished header rows (e.g. rename a header) before returning. */
  patchHeaders?: (grid: Grid) => void;
}

export function buildTemplateGrid(opts: BuildOptions = {}): Grid {
  const blocks = opts.blocks ?? TEMPLATE_BLOCKS;
  const grid: Grid = [];
  const set = (row: number, col: number, v: CellValue) => {
    grid[row - 1] ??= [];
    grid[row - 1][col] = v;
  };
  set(1, 0, opts.tabLabel ?? "TEMPLATE");
  set(1, 1, "Total taken: 0");

  for (const b of blocks) {
    const c0 = columnIndex(b.startCol);
    const notes = c0 + b.headers.length - 1;
    set(2, c0, b.room);
    set(2, c0 + 2, b.code);
    set(2, c0 + 3, b.timeslot);
    if (b.capacity !== undefined) set(3, c0 + 4, `capacity: ${b.capacity}`);
    set(4, c0, "Proctors:");
    set(4, c0 + 4, "Assigned: 1");
    set(4, c0 + 6, 0);
    set(4, notes, b.sectionsCell);
    set(5, c0 + 4, "Checked in: 0");
    set(5, c0 + 6, "Paper rec'd: 0");
    b.headers.forEach((h, i) => set(6, c0 + i, h));
    // The separator column is a merged cell spanning rows 2-6; the API returns
    // the value only in its top-left cell, the rest come back empty.
    set(2, notes + 1, `${b.room}, ${b.timeslot}`);
  }
  const m0 = columnIndex(MAKEUP_START);
  set(2, m0, "Makeup");
  set(2, m0 + 2, "F1");
  set(2, m0 + 3, "Don't edit here: go to One-Time Swaps instead");
  set(4, m0, "N=1");
  MAKEUP_HEADERS.forEach((h, i) => set(6, m0 + i, h));

  const nextRow = new Map<string, number>();
  for (const s of opts.students ?? []) {
    const b = blocks.find((x) => x.code === s.code);
    if (!b) throw new Error(`fixture: no block with code ${s.code}`);
    const c0 = columnIndex(b.startCol);
    const row = s.row ?? nextRow.get(s.code) ?? 7;
    nextRow.set(s.code, row + 1);
    const col = (h: string) => c0 + b.headers.indexOf(h);
    set(row, col("First name"), "SECRET-FIRST");
    set(row, col("Last name"), "SECRET-LAST");
    set(row, col("Seat #"), 99);
    set(row, col("Notes"), "SECRET-NOTE");
    if (s.andrewId !== undefined) set(row, col("Andrew id"), s.andrewId);
    if (s.section !== undefined) set(row, col("Section"), s.section);
    if (s.examNumber !== undefined) set(row, col("Exam #"), s.examNumber);
    set(row, col("Got paper"), s.gotPaper ?? false);
  }
  // Empty template rows still carry FALSE checkboxes and #N/A name formulas.
  for (const b of blocks) {
    const c0 = columnIndex(b.startCol);
    for (let r = 7; r <= 12; r++) {
      if (grid[r - 1]?.[c0 + b.headers.indexOf("Got paper")] === undefined) {
        set(r, c0, "#N/A");
        set(r, c0 + b.headers.indexOf("Got paper"), false);
      }
    }
  }
  // normalize holes to ""
  for (const row of grid) {
    if (!row) continue;
    for (let c = 0; c < row.length; c++) row[c] ??= "";
  }
  for (let r = 0; r < grid.length; r++) grid[r] ??= [];
  opts.patchHeaders?.(grid);
  return grid;
}

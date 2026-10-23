/**
 * The app's only view of a check-in tab. Everything the scanner needs
 * (lookup by exam number, tick one checkbox) goes through here, and nothing
 * here ever requests a student's name, seat, or notes.
 */

import { columnLetter, toA1, type CellValue, type SheetRange, type SheetsApi, type SpreadsheetInfo } from "./api";
import {
  describeLayout,
  HEADER_ROW,
  normalizeHeader,
  parseLayout,
  type LayoutResult,
  type RoomBlock,
} from "./layout";

export class LayoutMismatchError extends Error {
  constructor(public readonly layout: LayoutResult) {
    super(`Check-in tab layout does not match TEMPLATE: ${describeLayout(layout)}`);
    this.name = "LayoutMismatchError";
  }
}

/** Row data for each entered exam in the spreadsheet */
export interface CheckinRow {
  block: RoomBlock;
  /** 1-based sheet row, as Google displays it. */
  rowNumber: number;
  /** Trimmed, lowercased. `null` when the cell is blank or #N/A. */
  andrewId: string | null;
  section: string | null;
  /** Trimmed exam number as text. `null` when blank. */
  examNumber: string | null;
  gotPaper: boolean;
}

export type ExamLookup =
  | { kind: "found"; row: CheckinRow }
  | { kind: "not-found" }
  | { kind: "duplicate"; rows: CheckinRow[] };

export type SetGotPaperResult =
  /** `range` is the written cell in A1 notation, for logs. */
  | { kind: "written"; range: string }
  | { kind: "refused"; reason: "already-collected" | "row-changed" | "layout-changed"; detail: string };

export type ReloadLayoutResult =
  | { reachable: true; layout: LayoutResult; summary: string }
  | { reachable: false; error: string; summary: string };

export interface OpenCheckinSheetOptions {
  api: SheetsApi;
  spreadsheetId: string;
  /** Title of the tab (a copy of TEMPLATE) for tonight's exam. */
  tab: string;
}

export interface CheckinSheet {
  readonly spreadsheetId: string;
  readonly tab: string;
  /**
   * Re-reads the header rows, replaces the cached layout and drops cached
   * rows, then reports reachability + layout for the setup screen. Never
   * throws for API failures.
   */
  reloadLayout(): Promise<ReloadLayoutResult>;
  /** The spreadsheet's title and tabs, for the setup screen. */
  info(): Promise<SpreadsheetInfo>;
  /**
   * Exact-match lookup over the whole tab, with duplicate detection. Answers
   * from the row cache when it is fresh; a miss refreshes it once before
   * reporting not-found.
   */
  findExam(examNumber: string): Promise<ExamLookup>;
  /**
   * Writes exactly one cell: the row's "Got paper" checkbox. In the same
   * single read beforehand it checks the column headers and the row, and
   * refuses if the columns moved, the exam number no longer matches (sheet
   * edited underneath us), or the box is already TRUE when setting TRUE.
   */
  setGotPaper(row: CheckinRow, value: boolean): Promise<SetGotPaperResult>;
}

/** Normalizes a cell to text; blank and #N/A become null. */
export function cellToText(v: CellValue | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "#N/A" ? null : s;
}

export function normalizeAndrewId(v: CellValue | undefined): string | null {
  const s = cellToText(v);
  return s === null ? null : s.toLowerCase();
}

export function normalizeExamNumber(v: CellValue | undefined | string): string | null {
  return cellToText(v as CellValue);
}

function cellToBool(v: CellValue | undefined): boolean {
  if (v === true) return true;
  if (typeof v === "string") return v.trim().toUpperCase() === "TRUE";
  return false;
}

/** Groups the permitted columns of a block into contiguous open-ended ranges. */
export function dataRangesFor(tab: string, block: RoomBlock): SheetRange[] {
  const cols = [...new Set(Object.values(block.columns))].sort((a, b) => a - b);
  const ranges: SheetRange[] = [];
  let start = cols[0];
  let prev = cols[0];
  const push = () => ranges.push({ tab, rows: [block.firstDataRow], cols: [start, prev] });
  for (const c of cols.slice(1)) {
    if (c === prev + 1) {
      prev = c;
      continue;
    }
    push();
    start = prev = c;
  }
  push();
  return ranges;
}

/**
 * Layout and rows per spreadsheet tab, shared by every CheckinSheet in this
 * process whichever TA's token fetched them (all TAs see the same sheet).
 * Columns are assumed not to move during an exam, so the layout is read once;
 * setGotPaper's header check is the backstop if they do.
 * 
 * Keyed by `${spreadsheetId}\n${tab}`
 */
const knownLayouts = new Map<string, LayoutResult>();
const knownRows = new Map<string, { rows: CheckinRow[]; fetchedAt: number }>();

/** How long cached rows answer lookups before the next lookup re-reads them. */
export const ROW_CACHE_TTL_MS = 60_000;

export function openCheckinSheet(opts: OpenCheckinSheetOptions): CheckinSheet {
  const { api, spreadsheetId, tab } = opts;
  const key = `${spreadsheetId}\n${tab}`;

  /** Always clears row cache */
  async function fetchLayout(): Promise<LayoutResult> {
    const [header] = await api.batchGet(spreadsheetId, [{ tab, rows: [1, HEADER_ROW] }]);
    const layout = parseLayout(header);
    // A new layout (or a mismatch) invalidates rows read using the old columns.
    knownRows.delete(key);
    // Only a matching layout is kept, so a fixed sheet is picked up on the next lookup.
    if (layout.ok) knownLayouts.set(key, layout);
    else knownLayouts.delete(key);
    return layout;
  }

  function rowFrom(block: RoomBlock, rowNumber: number, cellAt: (col: number) => CellValue | undefined): CheckinRow {
    return {
      block,
      rowNumber,
      andrewId: normalizeAndrewId(cellAt(block.columns.andrewId)),
      section: cellToText(cellAt(block.columns.section)),
      examNumber: normalizeExamNumber(cellAt(block.columns.examNumber)),
      gotPaper: cellToBool(cellAt(block.columns.gotPaper)),
    };
  }

  // Results is exact query data from each range in plan, results[plan num][row][col] -> cell value
  function rowsFrom(plan: Array<{ block: RoomBlock; ranges: SheetRange[] }>, results: CellValue[][][]): CheckinRow[] {
    const rows: CheckinRow[] = [];
    let cursor = 0;
    for (const { block, ranges } of plan) {
      // Reassemble a sparse column->value map per row from this block's ranges.
      // key is [row][col] -> CellValue
      const perRow = new Map<number, Map<number, CellValue>>();
      for (const range of ranges) {
        const firstCol = range.cols![0];
        results[cursor++].forEach((cells, i) => {
          const rowNumber = block.firstDataRow + i;
          let m = perRow.get(rowNumber);
          if (!m) perRow.set(rowNumber, (m = new Map()));
          cells.forEach((v, j) => m!.set(firstCol + j, v));
        });
      }
      for (const [rowNumber, cells] of [...perRow.entries()].sort((a, b) => a[0] - b[0])) {
        const row = rowFrom(block, rowNumber, (c) => cells.get(c));
        // Rows with nothing in any permitted column are padding, not students.
        if (row.andrewId === null && row.examNumber === null && row.section === null && !row.gotPaper) continue;
        rows.push(row);
      }
    }
    return rows;
  }

  /** Every student row across every room block, reading only the permitted columns. Refreshes the row cache. */
  async function loadRows(): Promise<CheckinRow[]> {
    const layout = knownLayouts.get(key) ?? (await fetchLayout());
    if (!layout.ok) throw new LayoutMismatchError(layout);
    const plan = layout.blocks.map((block) => ({ block, ranges: dataRangesFor(tab, block) }));
    const rows = rowsFrom(plan, await api.batchGet(spreadsheetId, plan.flatMap((p) => p.ranges)));
    knownRows.set(key, { rows, fetchedAt: Date.now() });
    return rows;
  }

  async function findExam(examNumber: string): Promise<ExamLookup> {
    const wanted = normalizeExamNumber(examNumber);
    if (wanted === null) return { kind: "not-found" };
    const lookup = (rows: CheckinRow[]): ExamLookup => {
      // Copies, so callers can't edit the cache.
      const matches = rows.filter((r) => r.examNumber === wanted).map((r) => ({ ...r }));
      if (matches.length === 0) return { kind: "not-found" };
      if (matches.length === 1) return { kind: "found", row: matches[0] };
      return { kind: "duplicate", rows: matches };
    };
    const cached = knownRows.get(key);
    if (cached !== undefined && Date.now() - cached.fetchedAt < ROW_CACHE_TTL_MS) {
      // Only a clean hit is answered from cache. Any error (missing, duplicate,
      // already checked) may be stale, so it is confirmed against the sheet.
      const hit = lookup(cached.rows);
      if (hit.kind === "found" && !hit.row.gotPaper) return hit;
    }
    return lookup(await loadRows());
  }

  /** Keeps the cached copy of a row in step with a write we just made. */
  function recordGotPaper(row: CheckinRow, value: boolean): void {
    const cached = knownRows.get(key)?.rows.find((r) => r.block.code === row.block.code && r.rowNumber === row.rowNumber);
    if (cached) cached.gotPaper = value;
  }

  async function setGotPaper(row: CheckinRow, value: boolean): Promise<SetGotPaperResult> {
    const { block, rowNumber } = row;
    const { examNumber: examCol, gotPaper: boxCol } = block.columns;
    const cell = (r: number, col: number): SheetRange => ({ tab, rows: [r, r], cols: [col, col] });
    const boxCell = cell(rowNumber, boxCol);
    // One read: both column headers plus the row's exam number and checkbox.
    const [examHeader, boxHeader, examNow, boxNow] = await api.batchGet(spreadsheetId, [
      cell(HEADER_ROW, examCol),
      cell(HEADER_ROW, boxCol),
      cell(rowNumber, examCol),
      boxCell,
    ]);
    if (normalizeHeader(examHeader[0]?.[0]) !== "exam #" || normalizeHeader(boxHeader[0]?.[0]) !== "got paper") {
      knownLayouts.delete(key);
      knownRows.delete(key);
      return {
        kind: "refused",
        reason: "layout-changed",
        detail: `columns ${columnLetter(examCol)} and ${columnLetter(boxCol)} are no longer "Exam #" and "Got paper"`,
      };
    }
    const examNumberNow = normalizeExamNumber(examNow[0]?.[0]);
    if (examNumberNow !== row.examNumber) {
      knownRows.delete(key);
      return {
        kind: "refused",
        reason: "row-changed",
        detail: `row ${rowNumber} now holds exam ${examNumberNow ?? "(blank)"}, expected ${row.examNumber ?? "(blank)"}`,
      };
    }
    const current = cellToBool(boxNow[0]?.[0]);
    if (value && current) {
      knownRows.delete(key);
      return { kind: "refused", reason: "already-collected", detail: `row ${rowNumber} is already checked` };
    }
    await api.update(spreadsheetId, boxCell, [[value]]);
    recordGotPaper(row, value);
    return { kind: "written", range: toA1(boxCell) };
  }

  async function reloadLayout(): Promise<ReloadLayoutResult> {
    try {
      const layout = await fetchLayout();
      return { reachable: true, layout, summary: `reachable · ${describeLayout(layout)}` };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { reachable: false, error, summary: `unreachable: ${error}` };
    }
  }

  return { spreadsheetId, tab, reloadLayout, info: () => api.getInfo(spreadsheetId), findExam, setGotPaper };
}

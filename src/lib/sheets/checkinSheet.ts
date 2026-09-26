/**
 * The app's only view of a check-in tab. Everything the scanner needs
 * (lookup by exam number, tick one checkbox) goes through here, and nothing
 * here ever requests a student's name, seat, or notes.
 */

import { cellRange, columnIndex, columnRange, rowRange } from "./a1";
import type { CellValue, SheetsApi } from "./api";
import { describeLayout, FIRST_DATA_ROW, HEADER_ROW, parseLayout, type LayoutResult, type RoomBlock } from "./layout";

export class SpreadsheetNotAllowedError extends Error {
  constructor(public readonly spreadsheetId: string) {
    super(`Spreadsheet ${spreadsheetId} is not on the allowlist; refusing to contact it`);
    this.name = "SpreadsheetNotAllowedError";
  }
}

export class LayoutMismatchError extends Error {
  constructor(public readonly layout: LayoutResult) {
    super(`Check-in tab layout does not match TEMPLATE: ${describeLayout(layout)}`);
    this.name = "LayoutMismatchError";
  }
}

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
  | { kind: "written"; range: string }
  | { kind: "refused"; reason: "already-collected" | "row-changed"; detail: string };

export type InspectResult =
  | { reachable: true; layout: LayoutResult; summary: string }
  | { reachable: false; error: string; summary: string };

export interface OpenCheckinSheetOptions {
  api: SheetsApi;
  spreadsheetId: string;
  /** Title of the tab (a copy of TEMPLATE) for tonight's exam. */
  tab: string;
  /** Head-TA configured allowlist. Any other ID is refused before a request goes out. */
  allowedSpreadsheetIds: Iterable<string>;
}

export interface CheckinSheet {
  readonly spreadsheetId: string;
  readonly tab: string;
  /** Reachability + layout check for the setup screen. Never throws for API failures. */
  inspect(): Promise<InspectResult>;
  /** Every student row across every room block, reading only the permitted columns. */
  loadRows(): Promise<CheckinRow[]>;
  /** Exact-match lookup over the whole tab, with duplicate detection. */
  findExam(examNumber: string): Promise<ExamLookup>;
  /**
   * Writes exactly one cell: the row's "Got paper" checkbox. Re-reads the row
   * first and refuses if the box is already TRUE (when setting TRUE) or the
   * exam number no longer matches (sheet edited underneath us).
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

/** Groups the permitted columns of a block into contiguous A1 ranges. */
export function dataRangesFor(tab: string, block: RoomBlock): string[] {
  const cols = [...new Set(Object.values(block.columns))].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = cols[0];
  let prev = cols[0];
  for (const c of cols.slice(1)) {
    if (c === prev + 1) {
      prev = c;
      continue;
    }
    ranges.push(columnRange(tab, start, prev, block.firstDataRow));
    start = prev = c;
  }
  ranges.push(columnRange(tab, start, prev, block.firstDataRow));
  return ranges;
}

export function openCheckinSheet(opts: OpenCheckinSheetOptions): CheckinSheet {
  const allowed = new Set(opts.allowedSpreadsheetIds);
  if (!allowed.has(opts.spreadsheetId)) {
    throw new SpreadsheetNotAllowedError(opts.spreadsheetId);
  }
  const { api, spreadsheetId, tab } = opts;
  let layoutCache: LayoutResult | null = null;

  async function fetchLayout(): Promise<LayoutResult> {
    const [header] = await api.batchGet(spreadsheetId, [rowRange(tab, 1, HEADER_ROW)]);
    const layout = parseLayout(header.values ?? []);
    layoutCache = layout;
    return layout;
  }

  async function ensureLayout(): Promise<LayoutResult> {
    const layout = layoutCache ?? (await fetchLayout());
    if (!layout.ok) throw new LayoutMismatchError(layout);
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

  async function loadRows(): Promise<CheckinRow[]> {
    const layout = await ensureLayout();
    const plan = layout.blocks.map((block) => ({ block, ranges: dataRangesFor(tab, block) }));
    const allRanges = plan.flatMap((p) => p.ranges);
    const results = await api.batchGet(spreadsheetId, allRanges);

    const rows: CheckinRow[] = [];
    let cursor = 0;
    for (const { block, ranges } of plan) {
      // Reassemble a sparse column->value map per row from this block's ranges.
      const perRow = new Map<number, Map<number, CellValue>>();
      for (const range of ranges) {
        const vr = results[cursor++];
        const firstCol = firstColOfRange(range);
        (vr.values ?? []).forEach((cells, i) => {
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

  async function findExam(examNumber: string): Promise<ExamLookup> {
    const wanted = normalizeExamNumber(examNumber);
    if (wanted === null) return { kind: "not-found" };
    const matches = (await loadRows()).filter((r) => r.examNumber === wanted);
    if (matches.length === 0) return { kind: "not-found" };
    if (matches.length === 1) return { kind: "found", row: matches[0] };
    return { kind: "duplicate", rows: matches };
  }

  async function setGotPaper(row: CheckinRow, value: boolean): Promise<SetGotPaperResult> {
    const { block, rowNumber } = row;
    const examCell = cellRange(tab, block.columns.examNumber, rowNumber);
    const boxCell = cellRange(tab, block.columns.gotPaper, rowNumber);
    const [examNow, boxNow] = await api.batchGet(spreadsheetId, [examCell, boxCell]);
    const examNumberNow = normalizeExamNumber(examNow.values?.[0]?.[0]);
    if (examNumberNow !== row.examNumber) {
      return {
        kind: "refused",
        reason: "row-changed",
        detail: `row ${rowNumber} now holds exam ${examNumberNow ?? "(blank)"}, expected ${row.examNumber ?? "(blank)"}`,
      };
    }
    const current = cellToBool(boxNow.values?.[0]?.[0]);
    if (value && current) {
      return { kind: "refused", reason: "already-collected", detail: `row ${rowNumber} is already checked` };
    }
    await api.update(spreadsheetId, boxCell, [[value]]);
    return { kind: "written", range: boxCell };
  }

  async function inspect(): Promise<InspectResult> {
    try {
      const layout = await fetchLayout();
      return { reachable: true, layout, summary: `reachable · ${describeLayout(layout)}` };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { reachable: false, error, summary: `unreachable: ${error}` };
    }
  }

  return { spreadsheetId, tab, inspect, loadRows, findExam, setGotPaper };
}

/** 0-based index of the first column in an A1 range like `'Tab'!C7:E`. */
function firstColOfRange(range: string): number {
  const m = /!([A-Z]+)\d*(?::|$)/.exec(range);
  if (!m) throw new Error(`cannot parse range ${range}`);
  return columnIndex(m[1]);
}

export { FIRST_DATA_ROW };

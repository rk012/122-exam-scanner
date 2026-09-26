/**
 * Pure parsing of a check-in tab's header rows (rows 1-6) into room blocks.
 *
 * A check-in tab (a copy of TEMPLATE) lays rooms out horizontally. Each block
 * has its own header row in row 6 ("First name", "Last name", "Andrew id",
 * "Section", "Exam #", "Seat #", "Got paper", ..., "Notes") and room metadata
 * in rows 2-5 above it. Blocks are discovered by scanning row 6 for that
 * header pattern rather than assuming a fixed column stride, so a tab whose
 * layout drifted from TEMPLATE is reported instead of silently misread.
 *
 * Nothing in rows 1-6 is student data.
 */

import { columnLetter } from "./a1";

export const HEADER_ROW = 6;
export const FIRST_DATA_ROW = 7;

export interface RoomBlock {
  /** Position left to right, 0-based. */
  index: number;
  /** e.g. "DH 2210", "Accom". */
  room: string;
  /** e.g. "A1", "D1". */
  code: string;
  /** e.g. "7:00 - 7:35pm". */
  timeslot: string;
  capacity: number | null;
  /**
   * Sections this room proctors. `null` when the sheet shows none (#N/A).
   * `"various"` for the accommodations block, which takes any section.
   */
  sections: string[] | "various" | null;
  /** 0-based column indices of the columns the app is allowed to read. */
  columns: {
    andrewId: number;
    section: number;
    examNumber: number;
    gotPaper: number;
  };
  /** 0-based first and last column of the block (Notes), for diagnostics only. */
  firstCol: number;
  lastCol: number;
  firstDataRow: number;
}

export interface LayoutProblem {
  /** 0-based column where the problem was found, if applicable. */
  col?: number;
  message: string;
}

export interface LayoutResult {
  ok: boolean;
  blocks: RoomBlock[];
  problems: LayoutProblem[];
}

const REQUIRED_HEADERS = ["andrew id", "section", "exam #", "got paper"] as const;

export function normalizeHeader(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellText(v: unknown): string {
  const s = String(v ?? "").trim();
  return s === "#N/A" ? "" : s;
}

function parseSections(raw: string): RoomBlock["sections"] {
  const m = /^sections:\s*(.*)$/i.exec(raw);
  if (!m) return null;
  const body = m[1].trim();
  if (body === "" ) return null;
  if (/^\(?various\)?$/i.test(body)) return "various";
  return body
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseCapacity(raw: string): number | null {
  const m = /^capacity:\s*(\d+)/i.exec(raw);
  return m ? Number(m[1]) : null;
}

/** Splits row 6 into runs of consecutive non-empty header cells. */
function headerRuns(row6: unknown[]): Array<{ start: number; headers: string[] }> {
  const runs: Array<{ start: number; headers: string[] }> = [];
  let current: { start: number; headers: string[] } | null = null;
  for (let c = 0; c < row6.length; c++) {
    const h = normalizeHeader(row6[c]);
    if (h === "") {
      if (current) runs.push(current);
      current = null;
      continue;
    }
    // A new "first name" inside a run means two blocks abut with no
    // separator column; start a new run so both are still found.
    if (h === "first name" && current) {
      runs.push(current);
      current = null;
    }
    if (!current) current = { start: c, headers: [] };
    current.headers.push(h);
    // "Notes" is always a block's last column; end the run there so a
    // non-empty separator cell can never glue two blocks together.
    if (h === "notes") {
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);
  return runs;
}

export function parseLayout(headerRows: unknown[][]): LayoutResult {
  const problems: LayoutProblem[] = [];
  const blocks: RoomBlock[] = [];

  if (headerRows.length < HEADER_ROW) {
    problems.push({
      message: `expected at least ${HEADER_ROW} header rows, got ${headerRows.length}`,
    });
    return { ok: false, blocks, problems };
  }
  const row = (n: number): unknown[] => headerRows[n - 1] ?? [];
  const at = (n: number, c: number): string => cellText(row(n)[c]);

  for (const run of headerRuns(row(HEADER_ROW))) {
    const has = (h: string) => run.headers.includes(h);
    const isCheckin = has("exam #") || has("got paper") || has("first name");
    if (!isCheckin) continue; // e.g. the Makeup block: Andrew id, Section, Cause, ...

    const colOf = (h: string): number | undefined => {
      const i = run.headers.indexOf(h);
      return i === -1 ? undefined : run.start + i;
    };
    const missing: string[] = REQUIRED_HEADERS.filter((h) => !has(h));
    if (run.headers[0] !== "first name") missing.unshift("first name");
    if (missing.length > 0) {
      problems.push({
        col: run.start,
        message: `block starting at column ${columnLetter(run.start)} is missing header(s): ${missing
          .map((m) => JSON.stringify(m))
          .join(", ")}`,
      });
      continue;
    }
    const firstCol = run.start;
    const lastCol = run.start + run.headers.length - 1;
    if (run.headers[run.headers.length - 1] !== "notes") {
      problems.push({
        col: lastCol,
        message: `block starting at column ${columnLetter(firstCol)} does not end with "Notes"`,
      });
    }

    const room = at(2, firstCol);
    const code = at(2, firstCol + 2);
    const timeslot = at(2, firstCol + 3);
    if (room === "") {
      problems.push({ col: firstCol, message: `block at column ${columnLetter(firstCol)} has no room name in row 2` });
    }
    if (code === "") {
      problems.push({ col: firstCol + 2, message: `block at column ${columnLetter(firstCol)} has no room code in row 2` });
    }
    if (timeslot === "") {
      problems.push({ col: firstCol + 3, message: `block at column ${columnLetter(firstCol)} has no timeslot in row 2` });
    }

    let capacity: number | null = null;
    for (let c = firstCol; c <= lastCol; c++) {
      capacity = parseCapacity(at(3, c));
      if (capacity !== null) break;
    }
    let sections: RoomBlock["sections"] = null;
    for (let c = lastCol; c >= firstCol; c--) {
      const raw = at(4, c);
      if (/^sections:/i.test(raw)) {
        sections = parseSections(raw);
        break;
      }
    }

    blocks.push({
      index: blocks.length,
      room,
      code,
      timeslot,
      capacity,
      sections,
      columns: {
        andrewId: colOf("andrew id")!,
        section: colOf("section")!,
        examNumber: colOf("exam #")!,
        gotPaper: colOf("got paper")!,
      },
      firstCol,
      lastCol,
      firstDataRow: FIRST_DATA_ROW,
    });
  }

  if (blocks.length === 0 && problems.length === 0) {
    problems.push({ message: "no check-in room blocks found in row 6" });
  }
  const codes = new Map<string, number>();
  for (const b of blocks) {
    if (b.code === "") continue;
    const prev = codes.get(b.code);
    if (prev !== undefined) {
      problems.push({ col: b.firstCol, message: `room code ${b.code} appears twice (columns ${columnLetter(blocks[prev].firstCol)} and ${columnLetter(b.firstCol)})` });
    } else codes.set(b.code, b.index);
  }

  return { ok: problems.length === 0 && blocks.length > 0, blocks, problems };
}

/** Summary line for the head-TA setup screen, e.g. "7 rooms · layout matches". */
export function describeLayout(result: LayoutResult): string {
  const n = result.blocks.length;
  const rooms = `${n} room${n === 1 ? "" : "s"}`;
  if (result.ok) return `${rooms} · layout matches`;
  const first = result.problems[0]?.message ?? "unknown problem";
  const more = result.problems.length > 1 ? ` (+${result.problems.length - 1} more)` : "";
  return `${rooms} · layout mismatch: ${first}${more}`;
}

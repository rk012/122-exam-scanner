/**
 * Pure parsing of a check-in tab's header rows (rows 1-6) into room blocks.
 *
 * A check-in tab (a copy of TEMPLATE) lays rooms out horizontally. Each block
 * has its own header row in row 6 ("First name", "Last name", "Andrew id",
 * "Section", "Exam #", "Seat #", "Got paper", ..., "Notes") and room metadata
 * in rows 2-5 above it. Blocks are discovered by scanning row 6 for that
 * header pattern rather than assuming a fixed column stride, so a block that
 * drifted from TEMPLATE is reported instead of silently misread.
 *
 * There is no separate notion of time: a room is a (room name, timeslot)
 * pair, so the same physical room at two times is two rooms. The
 * accommodations ("Accom") and Makeup blocks are skipped entirely, by name.
 * Any other malformed block, such as a room not used tonight (row 2 reads
 * "unused" instead of a timeslot), is skipped and listed in `skipped`, and
 * the remaining blocks are still usable.
 *
 * Nothing in rows 1-6 is student data.
 */

import { columnLetter } from "./api";

/** Sheets (1 based) numbering  */
export const HEADER_ROW = 6;
export const FIRST_DATA_ROW = 7;

/** Layout data for each proctoring room */
export interface RoomBlock {
  /** Position left to right, 0-based. */
  index: number;
  /** Room name and timeslot, e.g. "DH 2210, 7:00 - 7:35pm". */
  room: string;
  /** Row 2's room name alone, e.g. "DH 2210". */
  name: string;
  /** Row 2's timeslot alone, e.g. "7:00 - 7:35pm". */
  timeslot: string;
  /** e.g. "A1". */
  code: string;
  capacity: number | null;
  /** Sections this room proctors. `null` when the sheet shows none (#N/A). */
  sections: string[] | null;
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
  /** Header runs left out of `blocks` because they aren't a usable room block. Don't affect `ok`. */
  skipped: LayoutProblem[];
  /** Problems with the tab as a whole. Any one makes it unusable. */
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
  if (body === "") return null;
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

/** parses layout from headerRows[col][row], zero based indexing for each */
export function parseLayout(headerRows: unknown[][]): LayoutResult {
  const problems: LayoutProblem[] = [];
  const skipped: LayoutProblem[] = [];
  const blocks: RoomBlock[] = [];

  if (headerRows.length < HEADER_ROW) {
    problems.push({
      message: `expected at least ${HEADER_ROW} header rows, got ${headerRows.length}`,
    });
    return { ok: false, blocks, skipped, problems };
  }
  const row = (n: number): unknown[] => headerRows[n - 1] ?? [];
  const at = (n: number, c: number): string => cellText(row(n)[c]);
  const quoted = (hs: readonly string[]) => hs.map((h) => JSON.stringify(h)).join(", ");

  for (const run of headerRuns(row(HEADER_ROW))) {
    // The known non-room blocks are dropped silently, by their row-2 name.
    // Accom must never be read, even though its headers look like a room's.
    if (/^(accom|makeup)\b/i.test(at(2, run.start))) continue;
    const has = (h: string) => run.headers.includes(h);

    const colOf = (h: string): number | undefined => {
      const i = run.headers.indexOf(h);
      return i === -1 ? undefined : run.start + i;
    };
    const firstCol = run.start;
    const lastCol = run.start + run.headers.length - 1;
    const name = at(2, firstCol);
    const code = at(2, firstCol + 2);
    const timeslot = at(2, firstCol + 3);

    // Every way this run fails to be a usable room block. Any one skips it.
    const malformed: string[] = [];
    const missing: string[] = REQUIRED_HEADERS.filter((h) => !has(h));
    if (run.headers[0] !== "first name") missing.unshift("first name");
    if (missing.length > 0) malformed.push(`missing header(s) ${quoted(missing)}`);
    // colOf takes the first match, so a repeated header would silently pick one of the copies.
    const repeated = REQUIRED_HEADERS.filter((h) => run.headers.indexOf(h) !== run.headers.lastIndexOf(h));
    if (repeated.length > 0) malformed.push(`repeats header(s) ${quoted(repeated)}`);
    if (run.headers[run.headers.length - 1] !== "notes") malformed.push(`does not end with "Notes"`);
    if (name === "") malformed.push("no room name in row 2");
    if (code === "") malformed.push("no room code in row 2");
    // A room not used tonight has a placeholder such as "unused" here; a real
    // timeslot always has a time in it.
    if (!/\d/.test(timeslot)) {
      malformed.push(timeslot === "" ? "no timeslot in row 2" : `timeslot ${JSON.stringify(timeslot)} is not a time`);
    }
    if (malformed.length > 0) {
      const label = code === "" ? "" : ` (${code})`;
      skipped.push({ col: firstCol, message: `block at column ${columnLetter(firstCol)}${label}: ${malformed.join("; ")}` });
      continue;
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
      room: `${name}, ${timeslot}`,
      name,
      timeslot,
      code,
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

  if (blocks.length === 0) {
    // Usually every block drifted the same way, so the first one says why.
    const why = skipped.length > 0 ? `; ${skipped[0].message}` : "";
    problems.push({ message: `no check-in room blocks found in row 6${why}` });
  }
  // Skipped blocks aren't rooms, so only usable blocks can collide.
  for (const [what, key] of [["room code", (b: RoomBlock) => b.code], ["room", (b: RoomBlock) => b.room]] as const) {
    const seen = new Map<string, number>();
    for (const b of blocks) {
      const prev = seen.get(key(b));
      if (prev !== undefined) {
        problems.push({ col: b.firstCol, message: `${what} ${key(b)} appears twice (columns ${columnLetter(blocks[prev].firstCol)} and ${columnLetter(b.firstCol)})` });
      } else seen.set(key(b), b.index);
    }
  }

  return { ok: problems.length === 0 && blocks.length > 0, blocks, skipped, problems };
}

/**
 * Summary line for the head-TA setup screen, e.g. "7 rooms · layout matches"
 * or "5 rooms · layout matches · 2 blocks skipped".
 */
export function describeLayout(result: LayoutResult): string {
  const n = result.blocks.length;
  const rooms = `${n} room${n === 1 ? "" : "s"}`;
  const s = result.skipped.length;
  const skipped = s === 0 ? "" : ` · ${s} block${s === 1 ? "" : "s"} skipped`;
  if (result.ok) return `${rooms} · layout matches${skipped}`;
  const first = result.problems[0]?.message ?? "unknown problem";
  const more = result.problems.length > 1 ? ` (+${result.problems.length - 1} more)` : "";
  return `${rooms} · layout mismatch: ${first}${more}${skipped}`;
}

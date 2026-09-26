/**
 * In-memory SheetsApi for tests. Understands the A1 shapes this module
 * produces: `'Tab'!1:6`, `'Tab'!C7:E`, `'Tab'!G12`, `'Tab'!A1:B2`.
 */
import type { CellValue, SheetsApi, ValueRange } from "../api";
import { columnIndex } from "../a1";

export type Grid = CellValue[][];

export interface FakeSheetsApi extends SheetsApi {
  grids: Map<string, Grid>;
  calls: Array<{ op: "batchGet"; spreadsheetId: string; ranges: string[] } | { op: "update"; spreadsheetId: string; range: string; values: CellValue[][] }>;
  cell(tab: string, col: number, row: number): CellValue | undefined;
}

interface ParsedRange {
  tab: string;
  c1: number;
  r1: number;
  c2: number | null; // null = to last column
  r2: number | null; // null = to last row
}

function parseRange(range: string): ParsedRange {
  const m = /^'((?:[^']|'')*)'!(.+)$/.exec(range);
  if (!m) throw new Error(`fake api: unquoted or malformed range ${range}`);
  const tab = m[1].replace(/''/g, "'");
  const ref = m[2];
  const whole = /^(\d+):(\d+)$/.exec(ref);
  if (whole) return { tab, c1: 0, r1: Number(whole[1]), c2: null, r2: Number(whole[2]) };
  const cols = /^([A-Z]+)(\d*):([A-Z]+)(\d*)$/.exec(ref);
  if (cols) {
    return {
      tab,
      c1: columnIndex(cols[1]),
      r1: cols[2] ? Number(cols[2]) : 1,
      c2: columnIndex(cols[3]),
      r2: cols[4] ? Number(cols[4]) : null,
    };
  }
  const single = /^([A-Z]+)(\d+)$/.exec(ref);
  if (single) {
    const c = columnIndex(single[1]);
    const r = Number(single[2]);
    return { tab, c1: c, r1: r, c2: c, r2: r };
  }
  throw new Error(`fake api: unsupported range ${ref}`);
}

export function createFakeSheetsApi(grids: Record<string, Grid>): FakeSheetsApi {
  const store = new Map(Object.entries(grids));
  const calls: FakeSheetsApi["calls"] = [];

  function slice(p: ParsedRange): CellValue[][] {
    const grid = store.get(p.tab);
    if (!grid) throw new Error(`fake api: no tab ${p.tab}`);
    const lastRow = p.r2 ?? grid.length;
    const out: CellValue[][] = [];
    for (let r = p.r1; r <= lastRow; r++) {
      const row = grid[r - 1] ?? [];
      const lastCol = p.c2 ?? row.length - 1;
      const cells: CellValue[] = [];
      for (let c = p.c1; c <= lastCol; c++) cells.push(row[c] ?? "");
      // Google trims trailing empty cells per row and trailing empty rows.
      while (cells.length && (cells[cells.length - 1] === "" || cells[cells.length - 1] === null)) cells.pop();
      out.push(cells);
    }
    while (out.length && out[out.length - 1].length === 0) out.pop();
    return out;
  }

  return {
    grids: store,
    calls,
    cell(tab, col, row) {
      return store.get(tab)?.[row - 1]?.[col];
    },
    async batchGet(spreadsheetId, ranges) {
      calls.push({ op: "batchGet", spreadsheetId, ranges: [...ranges] });
      return ranges.map<ValueRange>((range) => {
        const values = slice(parseRange(range));
        return values.length ? { range, values } : { range };
      });
    },
    async update(spreadsheetId, range, values) {
      calls.push({ op: "update", spreadsheetId, range, values });
      const p = parseRange(range);
      const grid = store.get(p.tab);
      if (!grid) throw new Error(`fake api: no tab ${p.tab}`);
      values.forEach((cells, i) => {
        const r = p.r1 - 1 + i;
        grid[r] ??= [];
        cells.forEach((v, j) => {
          grid[r][p.c1 + j] = v;
        });
      });
    },
  };
}

/**
 * In-memory SheetsApi for tests, seeded from a CSV export of a tab.
 *
 * CSV cells are typed the way Sheets would store them with UNFORMATTED_VALUE:
 * TRUE/FALSE are booleans, numerals are numbers, and a leading `'` forces
 * text (`'201` is the string "201"), as typing it into Sheets does.
 */
import { readFileSync } from "node:fs";
import type { CellValue, SheetRange, SheetsApi } from "../api";

export type Grid = CellValue[][];

export interface FakeSheetsApi extends SheetsApi {
  grids: Map<string, Grid>;
  calls: Array<
    | { op: "batchGet"; spreadsheetId: string; ranges: SheetRange[] }
    | { op: "update"; spreadsheetId: string; range: SheetRange; values: CellValue[][] }
  >;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') field += text[++i];
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") endField();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

function typed(s: string): CellValue {
  if (s === "TRUE") return true;
  if (s === "FALSE") return false;
  if (s.startsWith("'")) return s.slice(1);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

export function gridFromCsv(path: string | URL): Grid {
  return parseCsv(readFileSync(path, "utf8")).map((r) => r.map(typed));
}

export function createFakeSheetsApi(grids: Record<string, Grid>): FakeSheetsApi {
  const store = new Map(Object.entries(grids));
  const calls: FakeSheetsApi["calls"] = [];

  function tabGrid(tab: string): Grid {
    const grid = store.get(tab);
    if (!grid) throw new Error(`fake api: no tab ${tab}`);
    return grid;
  }

  function slice({ tab, rows: [r1, r2], cols }: SheetRange): CellValue[][] {
    const grid = tabGrid(tab);
    const out: CellValue[][] = [];
    for (let r = r1; r <= (r2 ?? grid.length); r++) {
      const row = grid[r - 1] ?? [];
      const [c1, c2] = cols ?? [0, row.length - 1];
      const cells: CellValue[] = [];
      for (let c = c1; c <= c2; c++) cells.push(row[c] ?? "");
      // Google trims trailing empty cells per row and trailing empty rows.
      while (cells.length && (cells.at(-1) === "" || cells.at(-1) === null)) cells.pop();
      out.push(cells);
    }
    while (out.length && out.at(-1)!.length === 0) out.pop();
    return out;
  }

  return {
    grids: store,
    calls,
    async batchGet(spreadsheetId, ranges) {
      calls.push({ op: "batchGet", spreadsheetId, ranges });
      return ranges.map(slice);
    },
    async update(spreadsheetId, range, values) {
      calls.push({ op: "update", spreadsheetId, range, values });
      const grid = tabGrid(range.tab);
      const c1 = range.cols?.[0] ?? 0;
      values.forEach((cells, i) => {
        const r = range.rows[0] - 1 + i;
        grid[r] ??= [];
        cells.forEach((v, j) => (grid[r][c1 + j] = v));
      });
    },
  };
}

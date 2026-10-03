/**
 * Minimal Google Sheets REST v4 client. Only the two calls this app needs.
 * Everything above this layer talks to the `SheetsApi` interface so tests can
 * substitute an in-memory grid.
 *
 * Callers address cells by index, never by A1 string: column indices are
 * 0-based (0 = A); sheet rows are 1-based, matching what Google shows. A1
 * notation is built here, at the HTTP boundary, and nowhere else.
 */

export type CellValue = string | number | boolean | null;

/** A rectangle on one tab. End bounds are inclusive. */
export interface SheetRange {
  tab: string;
  /** `[first, last]` sheet rows. Omit `last` to read to the bottom of the sheet. */
  rows: [first: number, last?: number];
  /** `[first, last]` column indices. Omit for every column. */
  cols?: [first: number, last: number];
}

export interface SheetsApi {
  /**
   * values.batchGet. Returns one grid per requested range, in order. Like
   * Google, trailing empty cells and rows are trimmed, so a grid may be
   * ragged or empty.
   */
  batchGet(spreadsheetId: string, ranges: SheetRange[]): Promise<CellValue[][][]>;
  /** values.update with RAW input. Writes exactly the given grid at `range`. */
  update(spreadsheetId: string, range: SheetRange, values: CellValue[][]): Promise<void>;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function columnLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`column index must be a non-negative integer, got ${index}`);
  }
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** `'Tab'!1:6`, `'Tab'!C7:E`, `'Tab'!G12`. Tab names are always quoted. */
export function toA1({ tab, rows: [r1, r2], cols }: SheetRange): string {
  let ref: string;
  if (!cols) {
    if (r2 === undefined) throw new RangeError("a range over every column needs a last row");
    ref = `${r1}:${r2}`;
  } else if (r1 === r2 && cols[0] === cols[1]) {
    ref = `${columnLetter(cols[0])}${r1}`;
  } else {
    ref = `${columnLetter(cols[0])}${r1}:${columnLetter(cols[1])}${r2 ?? ""}`;
  }
  return `'${tab.replace(/'/g, "''")}'!${ref}`;
}

export class SheetsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly googleStatus?: string,
  ) {
    super(message);
    this.name = "SheetsApiError";
  }
}

export interface GoogleSheetsApiOptions {
  /** Returns a bearer token for the acting user (the proctoring TA). */
  getAccessToken: () => Promise<string>;
  fetch?: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function describeFailure(res: Response): Promise<SheetsApiError> {
  let detail = "";
  let googleStatus: string | undefined;
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string } };
    detail = body.error?.message ?? "";
    googleStatus = body.error?.status;
  } catch {
    // non-JSON body; status line is all we have
  }
  const msg = `Sheets API ${res.status}${googleStatus ? ` ${googleStatus}` : ""}${detail ? `: ${detail}` : ""}`;
  return new SheetsApiError(msg, res.status, googleStatus);
}

export function createGoogleSheetsApi(opts: GoogleSheetsApiOptions): SheetsApi {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? DEFAULT_BASE;

  async function headers(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${await opts.getAccessToken()}`,
      "Content-Type": "application/json",
    };
  }

  return {
    async batchGet(spreadsheetId, ranges) {
      const params = new URLSearchParams();
      for (const r of ranges) params.append("ranges", toA1(r));
      // UNFORMATTED_VALUE so checkbox cells come back as booleans and numbers
      // as numbers; text stays text.
      params.set("valueRenderOption", "UNFORMATTED_VALUE");
      const url = `${base}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`;
      const res = await doFetch(url, { headers: await headers() });
      if (!res.ok) throw await describeFailure(res);
      const body = (await res.json()) as { valueRanges?: Array<{ values?: CellValue[][] }> };
      const got = body.valueRanges ?? [];
      if (got.length !== ranges.length) {
        throw new SheetsApiError(
          `Sheets API returned ${got.length} ranges for ${ranges.length} requested`,
          res.status,
        );
      }
      return got.map((vr) => vr.values ?? []);
    },

    async update(spreadsheetId, range, values) {
      const a1 = toA1(range);
      const params = new URLSearchParams({ valueInputOption: "RAW" });
      const url = `${base}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(a1)}?${params}`;
      const res = await doFetch(url, {
        method: "PUT",
        headers: await headers(),
        body: JSON.stringify({ range: a1, majorDimension: "ROWS", values }),
      });
      if (!res.ok) throw await describeFailure(res);
    },
  };
}

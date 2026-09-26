/**
 * Minimal Google Sheets REST v4 client. Only the two calls this app needs.
 * Everything above this layer talks to the `SheetsApi` interface so tests can
 * substitute an in-memory grid.
 */

export type CellValue = string | number | boolean | null;

export interface ValueRange {
  range: string;
  values?: CellValue[][];
}

export interface SheetsApi {
  /** values.batchGet. Returns one ValueRange per requested range, in order. */
  batchGet(spreadsheetId: string, ranges: string[]): Promise<ValueRange[]>;
  /** values.update with RAW input. Writes exactly the given grid at `range`. */
  update(spreadsheetId: string, range: string, values: CellValue[][]): Promise<void>;
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
      for (const r of ranges) params.append("ranges", r);
      // UNFORMATTED_VALUE so checkbox cells come back as booleans and numbers
      // as numbers; text stays text.
      params.set("valueRenderOption", "UNFORMATTED_VALUE");
      const url = `${base}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`;
      const res = await doFetch(url, { headers: await headers() });
      if (!res.ok) throw await describeFailure(res);
      const body = (await res.json()) as { valueRanges?: ValueRange[] };
      const got = body.valueRanges ?? [];
      if (got.length !== ranges.length) {
        throw new SheetsApiError(
          `Sheets API returned ${got.length} ranges for ${ranges.length} requested`,
          res.status,
        );
      }
      return got;
    },

    async update(spreadsheetId, range, values) {
      const params = new URLSearchParams({ valueInputOption: "RAW" });
      const url = `${base}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?${params}`;
      const res = await doFetch(url, {
        method: "PUT",
        headers: await headers(),
        body: JSON.stringify({ range, majorDimension: "ROWS", values }),
      });
      if (!res.ok) throw await describeFailure(res);
    },
  };
}

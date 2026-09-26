import { describe, expect, it, vi } from "vitest";
import { createGoogleSheetsApi, SheetsApiError } from "./api";

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init));
}

describe("createGoogleSheetsApi", () => {
  it("batchGet sends bearer token, ranges, and UNFORMATTED_VALUE", async () => {
    const fetch = fakeFetch(() => Response.json({ valueRanges: [{ range: "a", values: [[true]] }, { range: "b" }] }));
    const api = createGoogleSheetsApi({ getAccessToken: async () => "tok", fetch });
    const out = await api.batchGet("sheet/id", ["'T'!1:6", "'T'!C7:E"]);
    expect(out).toHaveLength(2);
    const [url, init] = fetch.mock.calls[0];
    const u = new URL(String(url));
    expect(u.pathname).toBe("/v4/spreadsheets/sheet%2Fid/values:batchGet");
    expect(u.searchParams.getAll("ranges")).toEqual(["'T'!1:6", "'T'!C7:E"]);
    expect(u.searchParams.get("valueRenderOption")).toBe("UNFORMATTED_VALUE");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("update PUTs with valueInputOption=RAW", async () => {
    const fetch = fakeFetch(() => Response.json({}));
    const api = createGoogleSheetsApi({ getAccessToken: async () => "tok", fetch });
    await api.update("id", "'T'!G7", [[true]]);
    const [url, init] = fetch.mock.calls[0];
    const u = new URL(String(url));
    expect(u.pathname).toBe("/v4/spreadsheets/id/values/'T'!G7");
    expect(u.searchParams.get("valueInputOption")).toBe("RAW");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ range: "'T'!G7", majorDimension: "ROWS", values: [[true]] });
  });

  it("surfaces Google's error message and status", async () => {
    const fetch = fakeFetch(() =>
      Response.json({ error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } }, { status: 403 }),
    );
    const api = createGoogleSheetsApi({ getAccessToken: async () => "tok", fetch });
    const err = await api.batchGet("id", ["'T'!1:6"]).catch((e) => e);
    expect(err).toBeInstanceOf(SheetsApiError);
    expect(err.status).toBe(403);
    expect(err.message).toBe("Sheets API 403 PERMISSION_DENIED: The caller does not have permission");
  });

  it("rejects a response with the wrong number of ranges", async () => {
    const fetch = fakeFetch(() => Response.json({ valueRanges: [] }));
    const api = createGoogleSheetsApi({ getAccessToken: async () => "tok", fetch });
    await expect(api.batchGet("id", ["'T'!1:6"])).rejects.toThrow(/returned 0 ranges for 1/);
  });
});

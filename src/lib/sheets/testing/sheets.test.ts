/**
 * The whole sheets module, run against an in-memory copy of
 * testSheet.csv (a TEMPLATE-shaped tab with a few students).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayoutMismatchError, openCheckinSheet, SpreadsheetNotAllowedError, type CheckinSheet } from "../checkinSheet";
import { HEADER_ROW } from "../layout";
import { createFakeSheetsApi, gridFromCsv, type FakeSheetsApi } from "./fakeSheetsApi";

const SHEET = "qa-sheet-id";
const TAB = "Exam 1";
const PERMITTED_HEADERS = ["Andrew id", "Section", "Exam #", "Got paper"];

let api: FakeSheetsApi;
let sheet: CheckinSheet;
const cell = (row: number, col: number) => api.grids.get(TAB)![row - 1][col];

beforeEach(() => {
  api = createFakeSheetsApi({ [TAB]: gridFromCsv(new URL("./testSheet.csv", import.meta.url)) });
  sheet = openCheckinSheet({ api, spreadsheetId: SHEET, tab: TAB, allowedSpreadsheetIds: [SHEET] });
});

// FERPA: every request in every test reads either header rows or permitted columns.
afterEach(() => {
  const headers = api.grids.get(TAB)?.[HEADER_ROW - 1] ?? [];
  for (const call of api.calls) {
    const ranges = call.op === "batchGet" ? call.ranges : [call.range];
    for (const { rows, cols } of ranges) {
      if (!cols) {
        expect(rows[1]).toBeLessThanOrEqual(HEADER_ROW);
        continue;
      }
      for (let c = cols[0]; c <= cols[1]; c++) {
        expect(PERMITTED_HEADERS, `column ${c} requested`).toContain(headers[c]);
      }
    }
  }
});

describe("check-in sheet", () => {
  it("refuses a spreadsheet not on the allowlist with zero API calls", () => {
    expect(() =>
      openCheckinSheet({ api, spreadsheetId: "some-other-sheet", tab: TAB, allowedSpreadsheetIds: [SHEET] }),
    ).toThrow(SpreadsheetNotAllowedError);
    expect(api.calls).toHaveLength(0);
  });

  it("discovers one room per (room, timeslot), ignoring Accom and Makeup", async () => {
    const r = await sheet.inspect();
    expect(r.summary).toBe("reachable · 6 rooms · layout matches");
    if (!r.reachable) throw new Error("expected reachable");
    expect(r.layout.blocks.map((b) => [b.code, b.room, b.capacity, b.sections])).toEqual([
      ["A1", "DH 2210, 7:00 - 7:35pm", 124, ["B", "C", "H", "I", "S"]],
      ["B1", "DH 2315, 7:00 - 7:35pm", 114, null],
      ["C1", "GHC 4401, 7:00 - 7:35pm", 122, ["J", "O", "P", "Q"]],
      ["A2", "DH 2210, 7:45 - 8:20pm", 124, ["A", "D", "E", "F", "G"]],
      ["B2", "DH 2315, 7:45 - 8:20pm", 114, null],
      ["C2", "GHC 4401, 7:45 - 8:20pm", 122, ["K", "L", "M", "N"]],
    ]);
  });

  it("loads every student row outside Accom, skipping padding rows", async () => {
    const rows = await sheet.loadRows();
    expect(rows.map((r) => [r.block.code, r.rowNumber, r.andrewId, r.section, r.examNumber, r.gotPaper])).toEqual([
      ["A1", 7, "aaaa", "B", "101", false],
      ["A1", 8, "bbbb", "C", "102", true],
      ["A1", 9, null, "H", "103", false],
      ["C1", 7, "foo", "J", "201", false],
      ["C2", 7, "bar", "K", "301", false],
      ["C2", 8, "baz", "L", "301", false],
    ]);
  });

  it("finds exams by exact match only, and reports duplicates", async () => {
    expect(await sheet.findExam(" 201 ")).toMatchObject({ kind: "found", row: { andrewId: "foo" } }); // stored as text
    expect(await sheet.findExam("103")).toMatchObject({ kind: "found", row: { andrewId: null } });
    for (const miss of ["10", "0101", "", "401" /* Accom */]) expect((await sheet.findExam(miss)).kind).toBe("not-found");
    const dup = await sheet.findExam("301");
    expect(dup.kind === "duplicate" && dup.rows.map((x) => x.andrewId)).toEqual(["bar", "baz"]);
  });

  it("writes exactly one checkbox, refusing double scans and rows that changed", async () => {
    const find = async (exam: string) => {
      const r = await sheet.findExam(exam);
      if (r.kind !== "found") throw new Error(`expected ${exam} found`);
      return r.row;
    };
    const updates = () => api.calls.filter((c) => c.op === "update");

    const a = await find("101");
    expect(await sheet.setGotPaper(a, true)).toEqual({ kind: "written", range: "'Exam 1'!G7" });
    expect(updates()).toEqual([
      { op: "update", spreadsheetId: SHEET, range: { tab: TAB, rows: [7, 7], cols: [6, 6] }, values: [[true]] },
    ]);
    expect([cell(7, 6), cell(8, 6), cell(9, 6)]).toEqual([true, true, false]);

    expect(await sheet.setGotPaper(await find("102"), true)).toMatchObject({ kind: "refused", reason: "already-collected" });

    // Someone re-sorted the sheet between lookup and write.
    const c = await find("201");
    api.grids.get(TAB)![c.rowNumber - 1][c.block.columns.examNumber] = "999";
    expect(await sheet.setGotPaper(c, true)).toMatchObject({ kind: "refused", reason: "row-changed" });
    expect(updates()).toHaveLength(1);

    // Undo is allowed.
    expect((await sheet.setGotPaper(await find("102"), false)).kind).toBe("written");
    expect(cell(8, 6)).toBe(false);
  });

  it("refuses to load rows when the layout drifted", async () => {
    api.grids.get(TAB)![HEADER_ROW - 1][6] = "Paper"; // A1 block's "Got paper"
    await expect(sheet.loadRows()).rejects.toBeInstanceOf(LayoutMismatchError);
    expect(api.calls).toHaveLength(1); // header read only
    expect((await sheet.inspect()).summary).toMatch(/^reachable · 5 rooms · layout mismatch: .*"got paper"/);
  });
});

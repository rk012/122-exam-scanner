/**
 * The whole sheets module, run against an in-memory copy of
 * testSheet.csv (a TEMPLATE-shaped tab with a few students).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayoutMismatchError, openCheckinSheet, type CheckinSheet } from "../checkinSheet";
import { HEADER_ROW } from "../layout";
import { createFakeSheetsApi, gridFromCsv, type FakeSheetsApi } from "./fakeSheetsApi";

const TAB = "Exam 1";
const PERMITTED_HEADERS = ["Andrew id", "Section", "Exam #", "Got paper"];

const CSV = new URL("./testSheet.csv", import.meta.url);
const CSV_HEADERS = gridFromCsv(CSV)[HEADER_ROW - 1];

let api: FakeSheetsApi;
let sheet: CheckinSheet;
let SHEET: string; // a fresh spreadsheet ID per test, so cached rows never carry over
let tests = 0;
const cell = (row: number, col: number) => api.grids.get(TAB)![row - 1][col];

beforeEach(() => {
  SHEET = `qa-sheet-${++tests}`;
  api = createFakeSheetsApi({ [TAB]: gridFromCsv(CSV) });
  sheet = openCheckinSheet({ api, spreadsheetId: SHEET, tab: TAB });
});

// FERPA: every request in every test reads either header rows or columns
// that were permitted in the layout the app last saw.
afterEach(() => {
  for (const call of api.calls) {
    const ranges = call.op === "batchGet" ? call.ranges : [call.range];
    for (const { rows, cols } of ranges) {
      if (!cols) {
        expect(rows[1]).toBeLessThanOrEqual(HEADER_ROW);
        continue;
      }
      for (let c = cols[0]; c <= cols[1]; c++) {
        expect(PERMITTED_HEADERS, `column ${c} requested`).toContain(CSV_HEADERS[c]);
      }
    }
  }
});

describe("check-in sheet", () => {
  it("discovers one room per (room, timeslot), ignoring Accom and Makeup", async () => {
    const r = await sheet.reloadLayout();
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

  it("reads each student's permitted columns, outside Accom", async () => {
    const seen = [];
    for (const exam of ["101", "102", "103", "201", "401"]) {
      const r = await sheet.findExam(exam);
      seen.push(r.kind === "found" ? [r.row.block.code, r.row.rowNumber, r.row.andrewId, r.row.section, r.row.gotPaper] : r.kind);
    }
    expect(seen).toEqual([
      ["A1", 7, "aaaa", "B", false],
      ["A1", 8, "bbbb", "C", true],
      ["A1", 9, null, "H", false], // no Andrew ID
      ["C1", 7, "foo", "J", false],
      "not-found", // Accom
    ]);
  });

  it("finds exams by exact match only, and reports duplicates", async () => {
    expect(await sheet.findExam(" 201 ")).toMatchObject({ kind: "found", row: { andrewId: "foo" } }); // stored as text
    for (const miss of ["10", "0101", ""]) expect((await sheet.findExam(miss)).kind).toBe("not-found");
    const dup = await sheet.findExam("301");
    expect(dup.kind === "duplicate" && dup.rows.map((x) => x.andrewId)).toEqual(["bar", "baz"]);
    // A student added after the rows were cached is still found.
    Object.assign(api.grids.get(TAB)![9], { 2: "qux", 3: "B", 4: 105 }); // A1 block, row 10
    expect(await sheet.findExam("105")).toMatchObject({ kind: "found", row: { rowNumber: 10, andrewId: "qux" } });
    // Looking up exam with checked box triggers refresh,
    // so a box unchecked since the rows were cached is not reported as checked.
    api.grids.get(TAB)![7][6] = false; // exam 102, cached as checked
    expect(await sheet.findExam("102")).toMatchObject({ kind: "found", row: { gotPaper: false } });
  });

  it("writes exactly one checkbox, refusing double scans and rows that changed", async () => {
    const find = async (exam: string) => {
      const r = await sheet.findExam(exam);
      if (r.kind !== "found") throw new Error(`expected ${exam} found`);
      return r.row;
    };
    const updates = () => api.calls.filter((c) => c.op === "update");

    await sheet.reloadLayout(); // the setup screen has already seen the layout
    const a = await find("101"); // the TA's first lookup fills row cache
    api.calls.length = 0;
    expect(await sheet.setGotPaper(a, true)).toEqual({ kind: "written", range: "'Exam 1'!G7" });
    expect(updates()).toEqual([
      { op: "update", spreadsheetId: SHEET, range: { tab: TAB, rows: [7, 7], cols: [6, 6] }, values: [[true]] },
    ]);
    expect([cell(7, 6), cell(8, 6), cell(9, 6)]).toEqual([true, true, false]);

    // Hot path: the lookup is answered from cache, so a scan is 1 read + 1 write.
    api.calls.length = 0;
    await sheet.setGotPaper(await find("103"), true);
    expect(api.calls.map((c) => c.op)).toEqual(["batchGet", "update"]);

    api.calls.length = 0;
    expect(await sheet.setGotPaper(await find("102"), true)).toMatchObject({ kind: "refused", reason: "already-collected" });

    // Someone re-sorted the sheet between lookup and write.
    const c = await find("201");
    api.grids.get(TAB)![c.rowNumber - 1][c.block.columns.examNumber] = "999";
    expect(await sheet.setGotPaper(c, true)).toMatchObject({ kind: "refused", reason: "row-changed" });

    // Someone moved columns after the lookup: the cached "Got paper" position is stale.
    const d = await find("101");
    api.grids.get(TAB)![HEADER_ROW - 1][d.block.columns.gotPaper] = "Seat #";
    expect(await sheet.setGotPaper(d, true)).toMatchObject({ kind: "refused", reason: "layout-changed" });
    expect(updates()).toHaveLength(0); // no refusal writes anything
  });

  it("refuses lookups on a sheet whose layout doesn't match", async () => {
    api.grids.get(TAB)![HEADER_ROW - 1][6] = "Paper"; // A1 block's "Got paper"
    expect((await sheet.reloadLayout()).summary).toMatch(/^reachable · 5 rooms · layout mismatch: .*"got paper"/);
    await expect(sheet.findExam("101")).rejects.toBeInstanceOf(LayoutMismatchError);
    expect(api.calls.flatMap((c) => (c.op === "batchGet" ? c.ranges : [])).every((r) => !r.cols)).toBe(true); // header reads only
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { columnIndex, columnLetter } from "./a1";
import { LayoutMismatchError, openCheckinSheet, SpreadsheetNotAllowedError, type CheckinSheet } from "./checkinSheet";
import { createFakeSheetsApi, type FakeSheetsApi } from "./testing/fakeSheetsApi";
import { buildTemplateGrid, TEMPLATE_BLOCKS } from "./testing/templateFixture";

const SHEET = "qa-sheet-id";
const TAB = "Exam 1";

function setup(students = defaultStudents()) {
  const api = createFakeSheetsApi({ [TAB]: buildTemplateGrid({ tabLabel: TAB, students }) });
  const sheet = openCheckinSheet({ api, spreadsheetId: SHEET, tab: TAB, allowedSpreadsheetIds: [SHEET] });
  return { api, sheet };
}

function defaultStudents() {
  return [
    { code: "A1", andrewId: "Aaaa", section: "B", examNumber: 101 },
    { code: "A1", andrewId: "bbbb", section: "C", examNumber: "102", gotPaper: true },
    { code: "A1", section: "H", examNumber: "103" }, // no Andrew ID
    { code: "C1", andrewId: "foo", section: "J", examNumber: "201" },
    { code: "C2", andrewId: "bar", section: "K", examNumber: "301" },
    { code: "C2", andrewId: "baz", section: "L", examNumber: "301" }, // duplicate of 301
    { code: "D1", andrewId: "asada", section: "E", examNumber: "401" },
  ];
}

/** Columns that must never appear in a data request. */
function forbiddenColumns(): Set<number> {
  const out = new Set<number>();
  for (const b of TEMPLATE_BLOCKS) {
    const c0 = columnIndex(b.startCol);
    b.headers.forEach((h, i) => {
      if (!["Andrew id", "Section", "Exam #", "Got paper"].includes(h)) out.add(c0 + i);
    });
  }
  return out;
}

function columnsIn(range: string): number[] {
  const m = /!([A-Z]+)\d*:([A-Z]+)\d*$/.exec(range) ?? /!([A-Z]+)\d+$/.exec(range);
  if (!m) throw new Error(`unparsed ${range}`);
  const a = columnIndex(m[1]);
  const b = m[2] ? columnIndex(m[2]) : a;
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

describe("allowlist", () => {
  it("refuses a spreadsheet not on the allowlist with zero API calls", () => {
    const api = createFakeSheetsApi({ [TAB]: buildTemplateGrid() });
    expect(() =>
      openCheckinSheet({ api, spreadsheetId: "some-other-sheet", tab: TAB, allowedSpreadsheetIds: [SHEET] }),
    ).toThrow(SpreadsheetNotAllowedError);
    expect(api.calls).toHaveLength(0);
  });
});

describe("loadRows", () => {
  let api: FakeSheetsApi;
  let sheet: CheckinSheet;
  beforeEach(() => ({ api, sheet } = setup()));

  it("returns normalized rows for every block, skipping padding rows", async () => {
    const rows = await sheet.loadRows();
    expect(rows.map((r) => [r.block.code, r.rowNumber, r.andrewId, r.section, r.examNumber, r.gotPaper])).toEqual([
      ["A1", 7, "aaaa", "B", "101", false],
      ["A1", 8, "bbbb", "C", "102", true],
      ["A1", 9, null, "H", "103", false],
      ["C1", 7, "foo", "J", "201", false],
      ["C2", 7, "bar", "K", "301", false],
      ["C2", 8, "baz", "L", "301", false],
      ["D1", 7, "asada", "E", "401", false],
    ]);
  });

  it("only ever requests header rows and the four permitted columns", async () => {
    await sheet.loadRows();
    const forbidden = forbiddenColumns();
    const gets = api.calls.filter((c) => c.op === "batchGet");
    expect(gets).toHaveLength(2); // headers, then data
    expect(gets[0].ranges).toEqual([`'${TAB}'!1:6`]);
    const dataRanges = gets[1].ranges;
    expect(dataRanges).toContain(`'${TAB}'!C7:E`);
    expect(dataRanges).toContain(`'${TAB}'!G7:G`);
    expect(dataRanges).toHaveLength(TEMPLATE_BLOCKS.length * 2);
    for (const range of dataRanges) {
      expect(range.startsWith(`'${TAB}'!`)).toBe(true);
      for (const c of columnsIn(range)) {
        expect(forbidden.has(c), `${range} touches forbidden column ${columnLetter(c)}`).toBe(false);
      }
    }
  });

  it("throws LayoutMismatchError instead of guessing when the layout drifted", async () => {
    const grid = buildTemplateGrid({ patchHeaders: (g) => { g[5][columnIndex("A") + 6] = "Paper"; } });
    const api = createFakeSheetsApi({ [TAB]: grid });
    const s = openCheckinSheet({ api, spreadsheetId: SHEET, tab: TAB, allowedSpreadsheetIds: [SHEET] });
    await expect(s.loadRows()).rejects.toBeInstanceOf(LayoutMismatchError);
    expect(api.calls.filter((c) => c.op === "batchGet")).toHaveLength(1);
  });
});

describe("findExam", () => {
  let sheet: CheckinSheet;
  beforeEach(() => ({ sheet } = setup()));

  it("finds an exact match, whether the sheet stored a number or text", async () => {
    const r = await sheet.findExam("101");
    expect(r.kind).toBe("found");
    if (r.kind === "found") expect(r.row.andrewId).toBe("aaaa");
    const t = await sheet.findExam(" 201 ");
    expect(t.kind).toBe("found");
  });

  it("does not approximate: 10 does not match 101, and 0101 does not match 101", async () => {
    expect((await sheet.findExam("10")).kind).toBe("not-found");
    expect((await sheet.findExam("0101")).kind).toBe("not-found");
    expect((await sheet.findExam("")).kind).toBe("not-found");
  });

  it("reports duplicates across the whole tab", async () => {
    const r = await sheet.findExam("301");
    expect(r.kind).toBe("duplicate");
    if (r.kind === "duplicate") expect(r.rows.map((x) => x.andrewId)).toEqual(["bar", "baz"]);
  });

  it("still finds a row whose Andrew ID is blank (the flag rule lives above this layer)", async () => {
    const r = await sheet.findExam("103");
    expect(r.kind).toBe("found");
    if (r.kind === "found") expect(r.row.andrewId).toBeNull();
  });
});

describe("setGotPaper", () => {
  let api: FakeSheetsApi;
  let sheet: CheckinSheet;
  beforeEach(() => ({ api, sheet } = setup()));

  it("writes exactly one cell, RAW boolean true", async () => {
    const found = await sheet.findExam("101");
    if (found.kind !== "found") throw new Error("expected found");
    const result = await sheet.setGotPaper(found.row, true);
    expect(result).toEqual({ kind: "written", range: `'${TAB}'!G7` });
    const updates = api.calls.filter((c) => c.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ spreadsheetId: SHEET, range: `'${TAB}'!G7`, values: [[true]] });
    expect(api.cell(TAB, 6, 7)).toBe(true);
    // neighbours untouched
    expect(api.cell(TAB, 6, 8)).toBe(true);
    expect(api.cell(TAB, 6, 9)).toBe(false);
  });

  it("refuses when the box is already TRUE and writes nothing", async () => {
    const found = await sheet.findExam("102");
    if (found.kind !== "found") throw new Error("expected found");
    const result = await sheet.setGotPaper(found.row, true);
    expect(result).toMatchObject({ kind: "refused", reason: "already-collected" });
    expect(api.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("refuses when the row's exam number changed since it was read", async () => {
    const found = await sheet.findExam("201");
    if (found.kind !== "found") throw new Error("expected found");
    // Someone re-sorted the sheet: row 7 of C1 now holds a different exam.
    api.grids.get(TAB)![6][columnIndex("S") + 4] = "999";
    const result = await sheet.setGotPaper(found.row, true);
    expect(result).toMatchObject({ kind: "refused", reason: "row-changed" });
    expect(api.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("can uncheck (undo) a checked box", async () => {
    const found = await sheet.findExam("102");
    if (found.kind !== "found") throw new Error("expected found");
    const result = await sheet.setGotPaper(found.row, false);
    expect(result.kind).toBe("written");
    expect(api.cell(TAB, 6, 8)).toBe(false);
  });

  it("re-reads only the exam and checkbox cells before writing", async () => {
    const found = await sheet.findExam("401");
    if (found.kind !== "found") throw new Error("expected found");
    await sheet.setGotPaper(found.row, true);
    const last = api.calls.filter((c) => c.op === "batchGet").at(-1)!;
    const bc = columnIndex("BC");
    expect(last.ranges).toEqual([`'${TAB}'!${columnLetter(bc + 4)}7`, `'${TAB}'!${columnLetter(bc + 6)}7`]);
  });
});

describe("inspect", () => {
  it("summarizes a reachable, matching sheet", async () => {
    const { sheet } = setup();
    const r = await sheet.inspect();
    expect(r.reachable).toBe(true);
    expect(r.summary).toBe("reachable · 7 rooms · layout matches");
  });

  it("reports unreachable instead of throwing", async () => {
    const api = createFakeSheetsApi({});
    const sheet = openCheckinSheet({ api, spreadsheetId: SHEET, tab: TAB, allowedSpreadsheetIds: [SHEET] });
    const r = await sheet.inspect();
    expect(r.reachable).toBe(false);
    expect(r.summary).toMatch(/^unreachable: /);
  });
});

import { describe, expect, it } from "vitest";
import { columnIndex } from "./a1";
import { describeLayout, parseLayout } from "./layout";
import { buildTemplateGrid, TEMPLATE_BLOCKS } from "./testing/templateFixture";

const headerRows = (grid: ReturnType<typeof buildTemplateGrid>) => grid.slice(0, 6);

describe("parseLayout on the TEMPLATE layout", () => {
  const result = parseLayout(headerRows(buildTemplateGrid()));

  it("finds all seven check-in blocks and ignores Makeup", () => {
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.blocks.map((b) => b.code)).toEqual(["A1", "B1", "C1", "A2", "B2", "C2", "D1"]);
    expect(result.blocks.map((b) => b.room)).toEqual(TEMPLATE_BLOCKS.map((b) => b.room));
  });

  it("reads room metadata", () => {
    const a1 = result.blocks[0];
    expect(a1.timeslot).toBe("7:00 - 7:35pm");
    expect(a1.capacity).toBe(124);
    expect(a1.sections).toEqual(["B", "C", "H", "I", "S"]);
    expect(a1.firstDataRow).toBe(7);
  });

  it("maps #N/A sections to null and Accom to 'various'", () => {
    expect(result.blocks[1].sections).toBeNull();
    const accom = result.blocks[6];
    expect(accom.sections).toBe("various");
    expect(accom.capacity).toBeNull();
    expect(accom.room).toBe("Accom");
  });

  it("locates columns by header name, including in the wider Accom block", () => {
    const a1 = result.blocks[0];
    expect(a1.columns).toEqual({ andrewId: 2, section: 3, examNumber: 4, gotPaper: 6 });
    const c2 = result.blocks[5];
    const at = columnIndex("AT");
    expect(c2.columns).toEqual({ andrewId: at + 2, section: at + 3, examNumber: at + 4, gotPaper: at + 6 });
    const accom = result.blocks[6];
    const bc = columnIndex("BC");
    expect(accom.columns.gotPaper).toBe(bc + 6);
    expect(accom.lastCol).toBe(bc + 10); // Notes
  });

  it("describes a matching layout", () => {
    expect(describeLayout(result)).toBe("7 rooms · layout matches");
  });
});

describe("parseLayout problems", () => {
  it("reports a renamed required header", () => {
    const grid = buildTemplateGrid({
      patchHeaders: (g) => {
        g[5][columnIndex("S") + 4] = "Exam number"; // C1 block's "Exam #"
      },
    });
    const r = parseLayout(headerRows(grid));
    expect(r.ok).toBe(false);
    expect(r.blocks.map((b) => b.code)).not.toContain("C1");
    expect(r.problems[0].message).toMatch(/column S .*"exam #"/);
    expect(describeLayout(r)).toMatch(/^6 rooms · layout mismatch: /);
  });

  it("reports a missing room code", () => {
    const grid = buildTemplateGrid({ patchHeaders: (g) => { g[1][columnIndex("AB") + 2] = ""; } });
    const r = parseLayout(headerRows(grid));
    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.message)).toContainEqual(expect.stringMatching(/column AB has no room code/));
  });

  it("reports duplicate room codes", () => {
    const grid = buildTemplateGrid({ patchHeaders: (g) => { g[1][columnIndex("J") + 2] = "A1"; } });
    const r = parseLayout(headerRows(grid));
    expect(r.problems.map((p) => p.message)).toContainEqual(expect.stringMatching(/room code A1 appears twice/));
  });

  it("reports an empty sheet and too few rows", () => {
    expect(parseLayout([]).problems[0].message).toMatch(/expected at least 6 header rows/);
    const blank = parseLayout([[], [], [], [], [], []]);
    expect(blank.ok).toBe(false);
    expect(blank.problems[0].message).toMatch(/no check-in room blocks/);
  });
});

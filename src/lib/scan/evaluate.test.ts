import { describe, expect, it } from "vitest";
import type { CheckinRow, RoomBlock } from "@/lib/sheets";
import { evaluateScan } from "./evaluate";

function block(over: Partial<RoomBlock> = {}): RoomBlock {
  return {
    index: 0,
    room: "DH 2210",
    code: "A1",
    timeslot: "7:00 - 7:35pm",
    capacity: 124,
    sections: ["B", "C"],
    columns: { andrewId: 2, section: 3, examNumber: 4, gotPaper: 6 },
    firstCol: 0,
    lastCol: 7,
    firstDataRow: 7,
    ...over,
  };
}

function row(over: Partial<CheckinRow> = {}): CheckinRow {
  return {
    block: block(),
    rowNumber: 7,
    andrewId: "foo",
    section: "B",
    examNumber: "101",
    gotPaper: false,
    ...over,
  };
}

const found = (r: CheckinRow) => ({ kind: "found" as const, row: r });

describe("evaluateScan", () => {
  it("matches a clean row in the selected room", () => {
    expect(evaluateScan("101", found(row()), "A1")).toEqual({
      status: "match",
      examNumber: "101",
      andrewId: "foo",
      room: { code: "A1", room: "DH 2210", timeslot: "7:00 - 7:35pm" },
    });
  });

  it("flags not-in-sheet and duplicate", () => {
    expect(evaluateScan("9", { kind: "not-found" }, "A1")).toMatchObject({
      status: "flagged",
      code: "not-in-sheet",
      flag: { title: "Not in this sheet" },
    });
    expect(evaluateScan("9", { kind: "duplicate", rows: [row(), row()] }, "A1")).toMatchObject({
      code: "duplicate",
    });
  });

  it("flags wrong room and says where the packet belongs, without student data", () => {
    const out = evaluateScan("101", found(row()), "C1");
    expect(out).toMatchObject({
      status: "flagged",
      code: "wrong-room",
      belongsTo: { code: "A1", room: "DH 2210", timeslot: "7:00 - 7:35pm" },
    });
    expect(JSON.stringify(out)).not.toContain("foo");
  });

  it("wrong room wins over every other problem", () => {
    const r = row({ andrewId: null, gotPaper: true, section: "Z" });
    expect(evaluateScan("101", found(r), "C1")).toMatchObject({ code: "wrong-room" });
  });

  it("flags a missing Andrew ID before considering the checkbox", () => {
    expect(evaluateScan("101", found(row({ andrewId: null, gotPaper: true })), "A1")).toMatchObject({
      code: "no-andrew-id",
    });
  });

  it("flags a garbage Andrew ID cell as malformed", () => {
    expect(evaluateScan("101", found(row({ andrewId: "foo bar!" })), "A1")).toMatchObject({
      code: "row-malformed",
    });
  });

  it("flags wrong section, and a missing section as malformed", () => {
    expect(evaluateScan("101", found(row({ section: "Q" })), "A1")).toMatchObject({ code: "wrong-section" });
    expect(evaluateScan("101", found(row({ section: null })), "A1")).toMatchObject({ code: "row-malformed" });
  });

  it("flags wrong section when the block has no sections assigned", () => {
    const r = row({ block: block({ sections: null }) });
    expect(evaluateScan("101", found(r), "A1")).toMatchObject({ code: "wrong-section" });
  });

  it("accepts any section in the accommodations block", () => {
    const r = row({ block: block({ code: "D1", room: "Accom", sections: "various" }), section: "Q" });
    expect(evaluateScan("101", found(r), "D1")).toMatchObject({ status: "match" });
    const noSection = row({ block: block({ code: "D1", sections: "various" }), section: null });
    expect(evaluateScan("101", found(noSection), "D1")).toMatchObject({ status: "match" });
  });

  it("flags already collected last", () => {
    expect(evaluateScan("101", found(row({ gotPaper: true })), "A1")).toMatchObject({
      code: "already-collected",
    });
  });
});

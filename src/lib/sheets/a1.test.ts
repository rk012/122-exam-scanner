import { describe, expect, it } from "vitest";
import { cellRange, columnIndex, columnLetter, columnRange, quoteTab, rowRange } from "./a1";

describe("column letters", () => {
  it("round-trips across the Z/AA boundary", () => {
    const pairs: Array<[number, string]> = [
      [0, "A"], [25, "Z"], [26, "AA"], [27, "AB"], [51, "AZ"], [52, "BA"], [72, "BU"], [701, "ZZ"], [702, "AAA"],
    ];
    for (const [i, s] of pairs) {
      expect(columnLetter(i)).toBe(s);
      expect(columnIndex(s)).toBe(i);
    }
  });
  it("rejects bad input", () => {
    expect(() => columnLetter(-1)).toThrow(RangeError);
    expect(() => columnIndex("A1")).toThrow(RangeError);
  });
});

describe("range builders", () => {
  it("quotes tab names and doubles embedded quotes", () => {
    expect(quoteTab("Exam 1")).toBe("'Exam 1'");
    expect(quoteTab("Rishi's tab")).toBe("'Rishi''s tab'");
  });
  it("builds the shapes the module uses", () => {
    expect(columnRange("Exam 1", 2, 4, 7)).toBe("'Exam 1'!C7:E");
    expect(rowRange("Exam 1", 1, 6)).toBe("'Exam 1'!1:6");
    expect(cellRange("Exam 1", 6, 12)).toBe("'Exam 1'!G12");
  });
});

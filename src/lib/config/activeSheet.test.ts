import { describe, expect, it } from "vitest";
import { parseSpreadsheetId } from "./activeSheet";

describe("parseSpreadsheetId", () => {
  const id = "1Ju3xgzEhyp4gkhs_A1L87YvVIPRfq03iUrXFetllpWk";
  it("accepts a bare id", () => {
    expect(parseSpreadsheetId(` ${id} `)).toBe(id);
  });
  it("extracts the id from an edit URL with a gid", () => {
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit?gid=1137503799#gid=1137503799`)).toBe(id);
  });
  it("rejects junk", () => {
    expect(parseSpreadsheetId("")).toBeNull();
    expect(parseSpreadsheetId("short")).toBeNull();
    expect(parseSpreadsheetId("https://example.com/")).toBeNull();
  });
});

/**
 * One exam night in room A1, end to end: the scan service against an
 * in-memory copy of the sheets module's testSheet.csv.
 */
import { expect, it } from "vitest";
import { openCheckinSheet } from "@/lib/sheets";
import { createFakeSheetsApi, gridFromCsv } from "@/lib/sheets/testing/fakeSheetsApi";
import { confirmScan, listRooms, lookupScan } from "./service";

const TAB = "Exam 1";
const SHEET = "scan-service-test"; // unique, so the sheets module's process cache starts empty
const CSV = new URL("../sheets/testing/testSheet.csv", import.meta.url);

it("matches, flags, and writes one box per confirm", async () => {
  const api = createFakeSheetsApi({ [TAB]: gridFromCsv(CSV) });
  const grid = api.grids.get(TAB)!;
  const sheet = openCheckinSheet({ api, spreadsheetId: SHEET, tab: TAB, allowedSpreadsheetIds: [SHEET] });
  const ctx = { sheet, roomCode: "A1" };
  const writes = () => api.calls.filter((c) => c.op === "update");

  // Proctor picks a room. Accom and Makeup are not offered.
  const rooms = await listRooms(sheet);
  expect("rooms" in rooms && rooms.rooms.map((r) => r.code)).toEqual(["A1", "B1", "C1", "A2", "B2", "C2"]);
  expect("rooms" in rooms && rooms.rooms[0]).toEqual({ code: "A1", room: "DH 2210, 7:00 - 7:35pm", capacity: 124 });

  // A row with a garbage Andrew ID, added after the template was copied.
  Object.assign(grid[9], { 2: "not an id!", 3: "B", 4: 104 }); // A1 block, row 10

  const outcomes = [];
  for (const exam of ["101", "102", "103", "104", "201", "301", "401", "999"]) {
    outcomes.push(await lookupScan(ctx, exam));
  }
  expect(outcomes.map((o) => (o.status === "match" ? `match ${o.andrewId}` : o.code))).toEqual([
    "match aaaa",
    "already-collected",
    "no-andrew-id",
    "row-malformed",
    "wrong-room",
    "duplicate",
    "not-in-sheet", // Accom is skipped by the sheets layer
    "not-in-sheet",
  ]);
  expect(outcomes[4]).toMatchObject({ belongsTo: { code: "C1", room: "GHC 4401, 7:00 - 7:35pm" } });
  expect(outcomes[2]).toMatchObject({ flag: { title: "No Andrew ID on the row" } });
  expect(writes()).toHaveLength(0); // lookups never write
  expect(JSON.stringify(outcomes)).not.toMatch(/SECRET/); // no names, notes or seats leak

  // ✓ on a match ticks exactly one box; a second ✓ is a double scan.
  expect(await confirmScan(ctx, "101")).toMatchObject({ status: "checked", andrewId: "aaaa" });
  expect(writes()).toHaveLength(1);
  expect(grid[6][6]).toBe(true);
  expect(await confirmScan(ctx, "101")).toMatchObject({ status: "flagged", code: "already-collected" });

  // Confirm re-checks: a wrong-room packet can't be forced through.
  expect(await confirmScan(ctx, "201")).toMatchObject({ code: "wrong-room" });

  // Someone ticks a box by hand between the lookup and the ✓.
  Object.assign(grid[10], { 2: "qux", 3: "B", 4: 105 }); // A1 block, row 11
  expect(await lookupScan(ctx, "105")).toMatchObject({ status: "match", andrewId: "qux" });
  grid[10][6] = true;
  expect(await confirmScan(ctx, "105")).toMatchObject({ status: "flagged", code: "already-collected" });
  expect(writes()).toHaveLength(1);
});

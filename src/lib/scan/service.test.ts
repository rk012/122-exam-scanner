import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { openCheckinSheet, type CheckinSheet } from "@/lib/sheets";
import { createFakeSheetsApi, type FakeSheetsApi } from "@/lib/sheets/testing/fakeSheetsApi";
import { buildTemplateGrid, type FixtureStudent } from "@/lib/sheets/testing/templateFixture";
import { traceExam } from "./log";
import { confirmScan, listRooms, lookupScan, type ScanContext } from "./service";

const SHEET = "1QAsheetIDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const TAB = "Exam 1";

let client: PGlite;
let db: Db;
beforeAll(async () => {
  client = new PGlite();
  const pg = drizzle(client, { schema });
  await migrate(pg, { migrationsFolder: "src/db/migrations" });
  db = pg as unknown as Db;
});
afterAll(async () => client.close());
beforeEach(async () => {
  await db.delete(schema.scanEvents);
});

const STUDENTS: FixtureStudent[] = [
  { code: "A1", andrewId: "amy", section: "B", examNumber: 101 },
  { code: "A1", andrewId: "bob", section: "C", examNumber: 102, gotPaper: true },
  { code: "A1", andrewId: "", section: "B", examNumber: 103 },
  { code: "C1", andrewId: "cat", section: "J", examNumber: 201 },
  { code: "A1", andrewId: "dup", section: "B", examNumber: 300 },
  { code: "C1", andrewId: "dup2", section: "J", examNumber: 300 },
];

function setup(students = STUDENTS): { ctx: ScanContext; api: FakeSheetsApi; sheet: CheckinSheet } {
  const api = createFakeSheetsApi({ [TAB]: buildTemplateGrid({ tabLabel: TAB, students }) });
  const sheet = openCheckinSheet({ api, spreadsheetId: SHEET, tab: TAB, allowedSpreadsheetIds: [SHEET] });
  return { ctx: { db, sheet, taAndrewId: "rishikum", roomCode: "A1" }, api, sheet };
}

describe("lookupScan", () => {
  it("returns a match with exam number and Andrew ID only, and logs it", async () => {
    const { ctx, api } = setup();
    const out = await lookupScan(ctx, "101");
    expect(out).toEqual({
      status: "match",
      examNumber: "101",
      andrewId: "amy",
      room: { code: "A1", room: "DH 2210", timeslot: "7:00 - 7:35pm" },
    });
    expect(api.calls.filter((c) => c.op === "update")).toHaveLength(0);
    const log = await traceExam(db, "101");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "lookup", outcome: "match", taAndrewId: "rishikum", roomCode: "A1" });
  });

  it("flags and logs every flag case without writing", async () => {
    const { ctx, api } = setup();
    expect(await lookupScan(ctx, "102")).toMatchObject({ code: "already-collected" });
    expect(await lookupScan(ctx, "103")).toMatchObject({ code: "no-andrew-id" });
    expect(await lookupScan(ctx, "201")).toMatchObject({ code: "wrong-room", belongsTo: { code: "C1" } });
    expect(await lookupScan(ctx, "999")).toMatchObject({ code: "not-in-sheet" });
    expect(await lookupScan(ctx, "300")).toMatchObject({ code: "duplicate" });
    expect(api.calls.filter((c) => c.op === "update")).toHaveLength(0);
    const wrongRoom = await traceExam(db, "201");
    expect(wrongRoom[0]).toMatchObject({ outcome: "wrong-room", detail: "belongs to C1" });
  });
});

describe("confirmScan", () => {
  it("writes exactly one cell and logs 'checked'", async () => {
    const { ctx, api } = setup();
    const out = await confirmScan(ctx, "101");
    expect(out).toMatchObject({ status: "checked", examNumber: "101", andrewId: "amy" });
    const writes = api.calls.filter((c) => c.op === "update");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ values: [[true]] });
    const log = await traceExam(db, "101");
    expect(log[0]).toMatchObject({ action: "confirm", outcome: "checked" });
  });

  it("re-checks the live sheet: a box ticked since the lookup is refused, nothing written", async () => {
    const { ctx, api } = setup();
    expect(await lookupScan(ctx, "101")).toMatchObject({ status: "match" });
    // Someone ticks the box by hand between lookup and confirm.
    const a1 = await confirmScan(ctx, "101");
    expect(a1.status).toBe("checked");
    const again = await confirmScan(ctx, "101");
    expect(again).toMatchObject({ status: "flagged", code: "already-collected" });
    expect(api.calls.filter((c) => c.op === "update")).toHaveLength(1);
    const log = await traceExam(db, "101");
    expect(log.map((e) => e.outcome)).toEqual(["already-collected", "checked", "match"]);
    expect(log[0].detail).toBe("no write attempted");
  });

  it("refuses to confirm a wrong-room packet", async () => {
    const { ctx, api } = setup();
    expect(await confirmScan(ctx, "201")).toMatchObject({ code: "wrong-room" });
    expect(api.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });
});

describe("listRooms", () => {
  it("lists every room block from the layout", async () => {
    const { sheet } = setup([]);
    const out = await listRooms(sheet);
    expect("rooms" in out && out.rooms.map((r) => r.code)).toEqual(["A1", "B1", "C1", "A2", "B2", "C2", "D1"]);
    expect("rooms" in out && out.rooms[0]).toEqual({ code: "A1", room: "DH 2210", timeslot: "7:00 - 7:35pm", capacity: 124 });
  });
});

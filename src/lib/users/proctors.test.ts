import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import {
  addProctors,
  isProctor,
  listProctors,
  normalizeAndrewId,
  parseAndrewIdInput,
  removeProctor,
} from "./proctors";

let client: PGlite;
let db: Db;

beforeAll(async () => {
  client = new PGlite();
  const pg = drizzle(client, { schema });
  await migrate(pg, { migrationsFolder: "src/db/migrations" });
  db = pg as unknown as Db;
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.delete(schema.proctors);
});

describe("normalizeAndrewId / parseAndrewIdInput", () => {
  it("lowercases and trims valid ids", () => {
    expect(normalizeAndrewId("  RishiKum ")).toBe("rishikum");
  });
  it("rejects emails, spaces, and empties", () => {
    expect(normalizeAndrewId("foo@andrew.cmu.edu")).toBeNull();
    expect(normalizeAndrewId("foo bar")).toBeNull();
    expect(normalizeAndrewId("")).toBeNull();
  });
  it("splits on commas, whitespace and newlines, dedupes, reports invalid", () => {
    expect(parseAndrewIdInput("a1, b2\nB2;  c3 bad@x ")).toEqual({
      valid: ["a1", "b2", "c3"],
      invalid: ["bad@x"],
    });
  });
});

describe("proctor repository", () => {
  it("starts empty and reports non-members", async () => {
    expect(await listProctors(db)).toEqual([]);
    expect(await isProctor(db, "nobody")).toBe(false);
  });

  it("adds, lists sorted, and checks membership case-insensitively", async () => {
    const added = await addProctors(db, ["zed", "amy"], "rishikum");
    expect(added.sort()).toEqual(["amy", "zed"]);
    const rows = await listProctors(db);
    expect(rows.map((r) => r.andrewId)).toEqual(["amy", "zed"]);
    expect(rows[0].addedBy).toBe("rishikum");
    expect(rows[0].addedAt).toBeInstanceOf(Date);
    expect(await isProctor(db, "AMY")).toBe(true);
  });

  it("is idempotent on re-add and returns only the new ids", async () => {
    await addProctors(db, ["amy"], "rishikum");
    expect(await addProctors(db, ["amy", "bob"], "other")).toEqual(["bob"]);
    const amy = (await listProctors(db)).find((r) => r.andrewId === "amy");
    expect(amy?.addedBy).toBe("rishikum");
  });

  it("removes and reports whether anything was removed", async () => {
    await addProctors(db, ["amy"], "rishikum");
    expect(await removeProctor(db, "amy")).toBe(true);
    expect(await removeProctor(db, "amy")).toBe(false);
    expect(await isProctor(db, "amy")).toBe(false);
  });

  it("adding nothing is a no-op", async () => {
    expect(await addProctors(db, [], "rishikum")).toEqual([]);
  });
});

/**
 * The proctor allowlist as a superadmin uses it from /admin/users, against an
 * in-process Postgres with the real migrations applied.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Db } from "@/db";
import { createTestDb } from "@/db/testing/testDb";
import { addProctors, isProctor, listProctors, parseAndrewIdInput, removeProctor } from "./proctors";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

it("adds a pasted list, ignores repeats and junk, checks membership, removes", async () => {
  const pasted = parseAndrewIdInput("Zed, amy\namy;  bad@andrew.cmu.edu ");
  expect(pasted).toEqual({ valid: ["zed", "amy"], invalid: ["bad@andrew.cmu.edu"] });

  expect((await addProctors(db, pasted.valid)).sort()).toEqual(["amy", "zed"]);
  // Re-adding reports only what was new.
  expect(await addProctors(db, ["amy", "bob"])).toEqual(["bob"]);

  expect((await listProctors(db)).map((r) => r.andrewId)).toEqual(["amy", "bob", "zed"]);
  expect(await isProctor(db, "AMY")).toBe(true);

  expect(await removeProctor(db, "amy")).toBe(true);
  expect(await removeProctor(db, "amy")).toBe(false);
  expect(await isProctor(db, "amy")).toBe(false);
});

/**
 * In-process Postgres (PGlite) with the real migrations applied, for tests
 * that exercise repository code. No network, no external database.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/db";
import * as schema from "@/db/schema";

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const pg = drizzle(client, { schema });
  await migrate(pg, { migrationsFolder: "src/db/migrations" });
  return { db: pg as unknown as Db, close: () => client.close() };
}

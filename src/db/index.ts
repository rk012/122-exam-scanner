import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * The database type every repository function accepts. It is the generic
 * drizzle Postgres database, so production (Neon over HTTP) and tests
 * (PGlite in-process) satisfy it interchangeably.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: NeonHttpDatabase<typeof schema> | undefined;

/**
 * Lazily connects using DATABASE_URL. Nothing touches the database at import
 * time, so `next build` and pages that don't need it work without one.
 */
export function getDb(): Db {
  if (!cached) {
    cached = drizzle(neon(env.databaseUrl), { schema });
  }
  return cached;
}

export { schema };

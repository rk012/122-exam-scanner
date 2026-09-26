import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { proctors, type Proctor } from "@/db/schema";

/** Andrew IDs are short, lowercase alphanumerics. Reject anything else at the door. */
const ANDREW_ID_RE = /^[a-z0-9]{1,32}$/;

export function normalizeAndrewId(raw: string): string | null {
  const id = raw.trim().toLowerCase();
  return ANDREW_ID_RE.test(id) ? id : null;
}

/**
 * Parses a free-text list of Andrew IDs (commas, whitespace, or newlines) into
 * valid ids and the raw tokens that were rejected.
 */
export function parseAndrewIdInput(raw: string): { valid: string[]; invalid: string[] } {
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const token of raw.split(/[\s,;]+/)) {
    if (token === "") continue;
    const id = normalizeAndrewId(token);
    if (id) valid.add(id);
    else invalid.push(token);
  }
  return { valid: [...valid], invalid };
}

export async function listProctors(db: Db): Promise<Proctor[]> {
  return db.select().from(proctors).orderBy(asc(proctors.andrewId));
}

export async function isProctor(db: Db, andrewId: string): Promise<boolean> {
  const rows = await db
    .select({ andrewId: proctors.andrewId })
    .from(proctors)
    .where(eq(proctors.andrewId, andrewId.toLowerCase()))
    .limit(1);
  return rows.length > 0;
}

/** Adds ids idempotently; returns the ids that were actually new. */
export async function addProctors(
  db: Db,
  andrewIds: readonly string[],
  addedBy: string,
): Promise<string[]> {
  if (andrewIds.length === 0) return [];
  const inserted = await db
    .insert(proctors)
    .values(andrewIds.map((andrewId) => ({ andrewId, addedBy })))
    .onConflictDoNothing()
    .returning({ andrewId: proctors.andrewId });
  return inserted.map((r) => r.andrewId);
}

export async function removeProctor(db: Db, andrewId: string): Promise<boolean> {
  const deleted = await db
    .delete(proctors)
    .where(eq(proctors.andrewId, andrewId.toLowerCase()))
    .returning({ andrewId: proctors.andrewId });
  return deleted.length > 0;
}

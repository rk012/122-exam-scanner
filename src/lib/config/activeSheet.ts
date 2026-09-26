import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { appConfig, type AppConfig } from "@/db/schema";

const ACTIVE = "active";

export interface ActiveSheet {
  spreadsheetId: string;
  tab: string;
  updatedBy: string;
  updatedAt: Date;
}

/**
 * Accepts either a bare spreadsheet ID or a full docs.google.com URL and
 * returns the ID, or null if neither.
 */
export function parseSpreadsheetId(raw: string): string | null {
  const s = raw.trim();
  const fromUrl = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(s);
  if (fromUrl) return fromUrl[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

export async function getActiveSheet(db: Db): Promise<ActiveSheet | null> {
  const rows = await db.select().from(appConfig).where(eq(appConfig.id, ACTIVE)).limit(1);
  const row: AppConfig | undefined = rows[0];
  if (!row) return null;
  return { spreadsheetId: row.spreadsheetId, tab: row.tab, updatedBy: row.updatedBy, updatedAt: row.updatedAt };
}

export async function setActiveSheet(
  db: Db,
  values: { spreadsheetId: string; tab: string },
  updatedBy: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(appConfig)
    .values({ id: ACTIVE, ...values, updatedBy, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.id, set: { ...values, updatedBy, updatedAt: now } });
}

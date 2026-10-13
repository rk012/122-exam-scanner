import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { appConfig, type AppConfig } from "@/db/schema";

const ACTIVE = "active";

/** The master tab each exam's tab is copied from. Never the active tab. */
export const TEMPLATE_TAB = "TEMPLATE";

/** Sheets tab names are unique case-insensitively, so "Template" is TEMPLATE too. */
export function isTemplateTab(tab: string): boolean {
  return tab.trim().toLowerCase() === TEMPLATE_TAB.toLowerCase();
}

export function spreadsheetUrl(spreadsheetId: string, gid?: number): string {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
  return gid === undefined ? url : `${url}#gid=${gid}`;
}

export interface ActiveSheet {
  spreadsheetId: string;
  /** `null` while no tab is chosen; scanning needs both. */
  tab: string | null;
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
  return { spreadsheetId: row.spreadsheetId, tab: row.tab };
}

export async function setActiveSheet(db: Db, values: ActiveSheet): Promise<void> {
  await db
    .insert(appConfig)
    .values({ id: ACTIVE, ...values })
    .onConflictDoUpdate({ target: appConfig.id, set: { ...values } });
}

/** Keeps the spreadsheet, forgets the tab. */
export async function clearActiveTab(db: Db): Promise<void> {
  await db.update(appConfig).set({ tab: null }).where(eq(appConfig.id, ACTIVE));
}

/** Forgets the spreadsheet entirely. */
export async function clearActiveSheet(db: Db): Promise<void> {
  await db.delete(appConfig).where(eq(appConfig.id, ACTIVE));
}

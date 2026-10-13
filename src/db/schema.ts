import { pgTable, text } from "drizzle-orm/pg-core";

/**
 * Proctor allowlist: users who may use the scanner. Independent of superadmin
 * (the SUPERUSERS env var): a superadmin who scans adds themselves here.
 */
export const proctors = pgTable("proctors", {
  andrewId: text("andrew_id").primaryKey(),
});

export type Proctor = typeof proctors.$inferSelect;

/**
 * Singleton app configuration edited by superadmins. The active spreadsheet is
 * also the entire spreadsheet allowlist: the sheets layer refuses any other ID.
 */
export const appConfig = pgTable("app_config", {
  id: text("id").primaryKey(), // always "active"
  spreadsheetId: text("spreadsheet_id").notNull(),
  /** `null` while a spreadsheet is chosen but no tab yet. */
  tab: text("tab"),
});

export type AppConfig = typeof appConfig.$inferSelect;

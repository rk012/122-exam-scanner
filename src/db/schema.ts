import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Proctor allowlist: regular users who may use the scanner. Superadmins are
 * NOT stored here; they come from the SUPERUSERS env var. Only Andrew IDs and
 * audit metadata are stored, never student data.
 */
export const proctors = pgTable("proctors", {
  andrewId: text("andrew_id").primaryKey(),
  addedBy: text("added_by").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Proctor = typeof proctors.$inferSelect;

/**
 * Singleton app configuration edited by superadmins. The active spreadsheet is
 * also the entire spreadsheet allowlist: the sheets layer refuses any other ID.
 */
export const appConfig = pgTable("app_config", {
  id: text("id").primaryKey(), // always "active"
  spreadsheetId: text("spreadsheet_id").notNull(),
  tab: text("tab").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppConfig = typeof appConfig.$inferSelect;

/**
 * Append-only scan log. Written on every lookup/confirm outcome, never read to
 * decide anything (the sheet is the only state). Holds exam numbers, the
 * proctoring TA's Andrew ID, room, timestamp and outcome. No student data.
 */
export const scanEvents = pgTable("scan_events", {
  id: serial("id").primaryKey(),
  examNumber: text("exam_number").notNull(),
  roomCode: text("room_code").notNull(),
  taAndrewId: text("ta_andrew_id").notNull(),
  /** "lookup" (nothing written) or "confirm" (write attempted). */
  action: text("action").notNull(),
  /** "match" | "checked" | flag code, see src/lib/scan/outcome.ts */
  outcome: text("outcome").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ScanEvent = typeof scanEvents.$inferSelect;

import { pgTable, text } from "drizzle-orm/pg-core";

/**
 * Proctor allowlist: users who may use the scanner. Independent of superadmin
 * (the SUPERUSERS env var): a superadmin who scans adds themselves here.
 */
export const proctors = pgTable("proctors", {
  andrewId: text("andrew_id").primaryKey(),
});

export type Proctor = typeof proctors.$inferSelect;

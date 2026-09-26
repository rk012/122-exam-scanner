import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

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

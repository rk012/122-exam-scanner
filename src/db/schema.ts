import { pgTable, text } from "drizzle-orm/pg-core";

/**
 * Proctor allowlist: regular users who may use the scanner. Superadmins are
 * NOT stored here; they come from the SUPERUSERS env var.
 */
export const proctors = pgTable("proctors", {
  andrewId: text("andrew_id").primaryKey(),
});

export type Proctor = typeof proctors.$inferSelect;

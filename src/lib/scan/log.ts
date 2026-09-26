import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { scanEvents, type ScanEvent } from "@/db/schema";

export type ScanAction = "lookup" | "confirm";

export interface ScanEventInput {
  examNumber: string;
  roomCode: string;
  taAndrewId: string;
  action: ScanAction;
  outcome: string;
  detail?: string;
}

/** Append-only. The app never reads this to decide anything. */
export async function recordScanEvent(db: Db, e: ScanEventInput): Promise<void> {
  await db.insert(scanEvents).values({ ...e, detail: e.detail ?? null });
}

/** For the "trace one exam" view only. */
export async function traceExam(db: Db, examNumber: string): Promise<ScanEvent[]> {
  return db.select().from(scanEvents).where(eq(scanEvents.examNumber, examNumber)).orderBy(desc(scanEvents.createdAt), desc(scanEvents.id));
}

import { and, desc, eq, lt } from "drizzle-orm";
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

export interface ScanEventFilter {
  examNumber?: string;
  roomCode?: string;
  taAndrewId?: string;
  /** For paging: only events older than this id. */
  beforeId?: number;
  limit?: number;
}

/** Newest first, for the admin log page (and its "trace one exam" view) only. */
export async function listScanEvents(db: Db, f: ScanEventFilter = {}): Promise<ScanEvent[]> {
  return db
    .select()
    .from(scanEvents)
    .where(
      and(
        f.examNumber === undefined ? undefined : eq(scanEvents.examNumber, f.examNumber),
        f.roomCode === undefined ? undefined : eq(scanEvents.roomCode, f.roomCode),
        f.taAndrewId === undefined ? undefined : eq(scanEvents.taAndrewId, f.taAndrewId),
        f.beforeId === undefined ? undefined : lt(scanEvents.id, f.beforeId),
      ),
    )
    .orderBy(desc(scanEvents.id))
    .limit(f.limit ?? 100);
}

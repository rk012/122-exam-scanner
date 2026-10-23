import { NextResponse } from "next/server";
import { listRooms } from "@/lib/scan/service";
import { resolveScanCallerContext } from "@/lib/scan/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/scan/rooms
 * Rooms and timeslots a proctor can pick from, read from the active sheet.
 * 200 { tab, rooms: [{ code, room, name, timeslot, capacity }] } | 502 { error, message }
 * `room` is the sheet's room name and timeslot, e.g. "DH 2210, 7:00 - 7:35pm";
 * `name` and `timeslot` are its two halves, for grouping by timeslot.
 */
export async function GET() {
  const caller = await resolveScanCallerContext();
  if (caller instanceof NextResponse) return caller;
  const result = await listRooms(caller.sheet);
  if ("error" in result) {
    return NextResponse.json({ error: "sheet-unavailable", message: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}

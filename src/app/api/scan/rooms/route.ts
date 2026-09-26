import { NextResponse } from "next/server";
import { listRooms } from "@/lib/scan/service";
import { resolveCaller } from "@/lib/scan/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/scan/rooms
 * Rooms and timeslots a proctor can pick from, read from the active sheet.
 * 200 { rooms: [{ code, room, timeslot, capacity }] } | 502 { error, message }
 */
export async function GET() {
  const caller = await resolveCaller();
  if (caller instanceof NextResponse) return caller;
  const result = await listRooms(caller.sheet);
  if ("error" in result) {
    return NextResponse.json({ error: "sheet-unavailable", message: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}

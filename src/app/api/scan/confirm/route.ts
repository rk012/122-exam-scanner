import { NextResponse } from "next/server";
import { readScanBody, resolveCaller } from "@/lib/scan/http";
import { confirmScan } from "@/lib/scan/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/scan/confirm  { examNumber, roomCode }
 * The proctor confirmed the Andrew ID matches the packet. Re-runs every check
 * against the live sheet, then ticks exactly one "Got paper" box as the TA.
 * 200 { status: "checked", examNumber, andrewId, room }
 * 200 { status: "flagged", ... }   (nothing written)
 */
export async function POST(req: Request) {
  const caller = await resolveCaller();
  if (caller instanceof NextResponse) return caller;
  const body = await readScanBody(req);
  if (body instanceof NextResponse) return body;
  const outcome = await confirmScan(
    { db: caller.db, sheet: caller.sheet, taAndrewId: caller.andrewId, roomCode: body.roomCode },
    body.examNumber,
  );
  return NextResponse.json(outcome);
}

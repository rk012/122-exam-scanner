import { NextResponse } from "next/server";
import { readScanBody, resolveCaller } from "@/lib/scan/http";
import { lookupScan } from "@/lib/scan/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/scan/lookup  { examNumber, roomCode }
 * Runs every check and returns what the proctor should see. Writes nothing.
 * 200 { status: "match", examNumber, andrewId, room }
 * 200 { status: "flagged", code, flag: { title, body, action }, examNumber, belongsTo? }
 */
export async function POST(req: Request) {
  const caller = await resolveCaller();
  if (caller instanceof NextResponse) return caller;
  const body = await readScanBody(req);
  if (body instanceof NextResponse) return body;
  const outcome = await lookupScan(
    { db: caller.db, sheet: caller.sheet, taAndrewId: caller.andrewId, roomCode: body.roomCode },
    body.examNumber,
  );
  return NextResponse.json(outcome);
}

/**
 * Interfacing between HTTP request and the scan service: who is calling, may they
 * scan, which sheet is active, and a Sheets client acting as that TA.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb, type Db } from "@/db";
import { getActiveSheet } from "@/lib/config/activeSheet";
import { env } from "@/lib/env";
import { getGoogleAccess } from "@/lib/google/access";
import { createGoogleSheetsApi, openCheckinSheet, type CheckinSheet } from "@/lib/sheets";
import { isProctor } from "@/lib/users/proctors";

export type ApiErrorCode =
  | "unauthenticated"
  | "not-a-proctor"
  | "sheets-access-missing"
  | "session-expired"
  | "no-active-sheet"
  | "not-configured"
  | "bad-request";

export function apiError(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json({ error: code, message }, { status });
}

export interface ScanCallerContext {
  db: Db;
  andrewId: string;
  sheet: CheckinSheet;
}

/**
 * Resolves the calling proctor and a handle on the active sheet, or an error
 * response.
 */
export async function resolveScanCallerContext(): Promise<ScanCallerContext | NextResponse> {
  const session = await auth();
  if (!session?.user?.andrewId) {
    return apiError("unauthenticated", "Sign in with your Andrew account.", 401);
  }
  const { andrewId } = session.user;

  if (!env.hasDatabaseUrl) {
    return apiError("not-configured", "No database is configured on this deployment.", 503);
  }
  const db = getDb();

  if (!(await isProctor(db, andrewId))) {
    return apiError("not-a-proctor", "Not on the proctor list.", 403);
  }

  const google = await getGoogleAccess();
  if (!google.ok && google.reason === "expired") {
    return apiError("session-expired", "Your Google session expired. Sign in again.", 401);
  }
  if (!google.ok) {
    return apiError("sheets-access-missing", "Spreadsheet access was not granted. Sign in again and allow it.", 403);
  }

  const active = await getActiveSheet(db);
  if (!active?.tab) {
    return apiError("no-active-sheet", "Checkin spreadsheet is not configured.", 503);
  }

  const api = createGoogleSheetsApi({ getAccessToken: async () => google.accessToken });
  const sheet = openCheckinSheet({ api, spreadsheetId: active.spreadsheetId, tab: active.tab });
  return { db, andrewId, sheet };
}

export interface ScanRequestBody {
  examNumber: string;
  roomCode: string;
}

/** Parses and validates the JSON body shared by lookup and confirm. */
export async function readScanBody(req: Request): Promise<ScanRequestBody | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("bad-request", "Body must be JSON.", 400);
  }
  const b = body as Partial<Record<keyof ScanRequestBody, unknown>>;
  const examNumber = typeof b.examNumber === "string" ? b.examNumber.trim() : "";
  const roomCode = typeof b.roomCode === "string" ? b.roomCode.trim() : "";
  if (examNumber.length === 0 || examNumber.length > 32) {
    return apiError("bad-request", "examNumber must be a non-empty string.", 400);
  }
  if (roomCode.length === 0 || roomCode.length > 32) {
    return apiError("bad-request", "roomCode must be a non-empty string.", 400);
  }
  return { examNumber, roomCode };
}

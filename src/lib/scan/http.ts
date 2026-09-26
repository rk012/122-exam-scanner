/**
 * Glue between an HTTP request and the scan service: who is calling, may they
 * scan, which sheet is active, and a Sheets client acting as that TA.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb, type Db } from "@/db";
import { getActiveSheet } from "@/lib/config/activeSheet";
import { env } from "@/lib/env";
import { hasSheetsScope } from "@/lib/google/refresh";
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

export interface Caller {
  db: Db;
  andrewId: string;
  sheet: CheckinSheet;
}

/**
 * Resolves the calling proctor and an allowlisted sheet handle, or an error
 * response. Order matters: identity, permission, then configuration.
 */
export async function resolveCaller(): Promise<Caller | NextResponse> {
  const session = await auth();
  if (!session?.user?.andrewId) {
    return apiError("unauthenticated", "Sign in with your Andrew account.", 401);
  }
  const { andrewId, role } = session.user;

  if (!env.hasDatabaseUrl) {
    return apiError("not-configured", "No database is configured on this deployment.", 503);
  }
  const db = getDb();

  if (role !== "superadmin" && !(await isProctor(db, andrewId))) {
    return apiError("not-a-proctor", "Not on the proctor list: ask a head TA to add you.", 403);
  }

  const google = session.google;
  if (!google) {
    return apiError("sheets-access-missing", "Sign in again to grant spreadsheet access.", 403);
  }
  if (google.error === "refresh-failed") {
    return apiError("session-expired", "Your Google session expired. Sign in again.", 401);
  }
  if (!hasSheetsScope(google.scope)) {
    return apiError("sheets-access-missing", "Spreadsheet access was not granted. Sign in again and allow it.", 403);
  }

  const active = await getActiveSheet(db);
  if (!active) {
    return apiError("no-active-sheet", "A head TA has not set tonight's spreadsheet yet.", 503);
  }

  const api = createGoogleSheetsApi({ getAccessToken: async () => google.accessToken });
  const sheet = openCheckinSheet({
    api,
    spreadsheetId: active.spreadsheetId,
    tab: active.tab,
    // The active sheet is the whole allowlist.
    allowedSpreadsheetIds: [active.spreadsheetId],
  });
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
  if (!/^[A-Z]\d{1,2}$/.test(roomCode)) {
    return apiError("bad-request", "roomCode must be a room code like A1.", 400);
  }
  return { examNumber, roomCode };
}

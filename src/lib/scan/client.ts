/**
 * Browser-side calls to the scan API. Every call resolves to the response
 * body or an error the UI can show; none of them throw.
 */

import type { ConfirmOutcome, RoomOption, ScanOutcome } from "./outcome";

export interface ApiError {
  /** An `ApiErrorCode` from ./http, or `network` / `server` when the response had no error body. */
  error: string;
  message: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Errors that only signing in again (and granting Sheets access) can fix. */
export function needsSignIn(e: ApiError): boolean {
  return e.error === "unauthenticated" || e.error === "session-expired" || e.error === "sheets-access-missing";
}

function isApiError(body: unknown): body is ApiError {
  const b = body as Partial<ApiError> | null;
  return typeof b?.error === "string" && typeof b.message === "string";
}

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, cache: "no-store" });
  } catch {
    return {
      ok: false,
      error: { error: "network", message: "Couldn't reach the server. Check your connection and try again." },
    };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok && body !== null) return { ok: true, data: body as T };
  if (isApiError(body)) return { ok: false, error: body };
  return {
    ok: false,
    error: {
      error: "server",
      message: `Something went wrong (HTTP ${res.status}). Try again, or tick the box in the sheet by hand.`,
    },
  };
}

export interface RoomsResponse {
  /** Tonight's tab, e.g. "Exam 1". */
  tab: string;
  rooms: RoomOption[];
}

export function fetchRooms(): Promise<ApiResult<RoomsResponse>> {
  return call("/api/scan/rooms");
}

function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** Runs every check for the packet. Writes nothing. */
export function lookupExam(examNumber: string, roomCode: string): Promise<ApiResult<ScanOutcome>> {
  return post("/api/scan/lookup", { examNumber, roomCode });
}

/** Re-runs every check, then ticks the packet's Got paper box as this TA. */
export function confirmExam(examNumber: string, roomCode: string): Promise<ApiResult<ConfirmOutcome>> {
  return post("/api/scan/confirm", { examNumber, roomCode });
}

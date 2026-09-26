"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { parseSpreadsheetId, setActiveSheet } from "@/lib/config/activeSheet";
import { hasSheetsScope } from "@/lib/google/refresh";
import { createGoogleSheetsApi, openCheckinSheet } from "@/lib/sheets";

export interface SetSheetResult {
  ok: boolean;
  message: string;
}

export async function setActiveSheetAction(_prev: SetSheetResult | null, formData: FormData): Promise<SetSheetResult> {
  const session = await auth();
  if (session?.user?.role !== "superadmin") {
    return { ok: false, message: "Only superadmins can change the active sheet." };
  }
  const spreadsheetId = parseSpreadsheetId(String(formData.get("spreadsheet") ?? ""));
  const tab = String(formData.get("tab") ?? "").trim();
  if (!spreadsheetId) return { ok: false, message: "That is not a Google Sheets URL or ID." };
  if (!tab) return { ok: false, message: "Enter the tab name for tonight's exam." };

  // Check reachability and layout as this superadmin before saving, so a
  // wrong ID or a tab that doesn't match TEMPLATE never becomes active.
  const google = session.google;
  if (!google || google.error || !hasSheetsScope(google.scope)) {
    return { ok: false, message: "Sign in again and allow spreadsheet access to verify the sheet." };
  }
  const sheet = openCheckinSheet({
    api: createGoogleSheetsApi({ getAccessToken: async () => google.accessToken }),
    spreadsheetId,
    tab,
    allowedSpreadsheetIds: [spreadsheetId],
  });
  const result = await sheet.inspect();
  if (!result.reachable || !result.layout.ok) {
    return { ok: false, message: `Not saved: ${result.summary}` };
  }
  await setActiveSheet(getDb(), { spreadsheetId, tab }, session.user.andrewId);
  revalidatePath("/admin/sheet");
  return { ok: true, message: `Saved. ${result.summary}` };
}

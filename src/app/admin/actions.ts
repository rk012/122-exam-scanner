"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db";
import {
  clearActiveSheet,
  clearActiveTab,
  getActiveSheet,
  isTemplateTab,
  parseSpreadsheetId,
  setActiveSheet,
  spreadsheetUrl,
  TEMPLATE_TAB,
} from "@/lib/config/activeSheet";
import { getGoogleAccess } from "@/lib/google/access";
import { createGoogleSheetsApi, describeLayout, openCheckinSheet, type RoomBlock } from "@/lib/sheets";
import { addProctors, listProctors, parseAndrewIdInput, removeProctor } from "@/lib/users/proctors";

async function requireSuperadmin(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "superadmin") {
    throw new Error("Only superadmins can use the admin page.");
  }
}

// The proctor actions return the updated list instead of revalidating /admin,
// so an edit doesn't re-render the rest of the page.

async function proctorIds(): Promise<string[]> {
  return (await listProctors(getDb())).map((p) => p.andrewId);
}

export interface AddResult {
  added: string[];
  alreadyPresent: string[];
  invalid: string[];
  proctors: string[];
}

export async function addProctorsAction(
  _prev: AddResult | null,
  formData: FormData,
): Promise<AddResult> {
  await requireSuperadmin();
  const raw = String(formData.get("andrewIds") ?? "");
  const { valid, invalid } = parseAndrewIdInput(raw);
  const added = await addProctors(getDb(), valid);
  const addedSet = new Set(added);
  return {
    added,
    alreadyPresent: valid.filter((id) => !addedSet.has(id)),
    invalid,
    proctors: await proctorIds(),
  };
}

/** Returns the proctor list after the removal. */
export async function removeProctorAction(formData: FormData): Promise<string[]> {
  await requireSuperadmin();
  const andrewId = String(formData.get("andrewId") ?? "");
  await removeProctor(getDb(), andrewId);
  return proctorIds();
}

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
  const tab = String(formData.get("tab") ?? "").trim() || null;
  if (!spreadsheetId) return { ok: false, message: "That is not a Google Sheets URL or ID." };
  if (tab && isTemplateTab(tab)) {
    return { ok: false, message: `${TEMPLATE_TAB} is the master copy. Duplicate it and enter the copy's tab name.` };
  }

  // Check reachability (and the tab's layout, if one is given) as this
  // superadmin before saving, so a wrong ID or a tab that doesn't match
  // TEMPLATE never becomes active.
  const google = await getGoogleAccess();
  if (!google.ok) {
    return { ok: false, message: "Sign in again and allow spreadsheet access to verify the sheet." };
  }
  const api = createGoogleSheetsApi({ getAccessToken: async () => google.accessToken });
  let summary: string;
  if (tab) {
    const sheet = openCheckinSheet({ api, spreadsheetId, tab });
    const result = await sheet.reloadLayout();
    if (!result.reachable || !result.layout.ok) {
      return { ok: false, message: `Not saved: ${result.summary}` };
    }
    summary = result.summary;
  } else {
    try {
      summary = `reachable · "${(await api.getInfo(spreadsheetId)).title}" · no tab yet`;
    } catch (e) {
      return { ok: false, message: `Not saved: unreachable: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  await setActiveSheet(getDb(), { spreadsheetId, tab });
  revalidatePath("/admin");
  return { ok: true, message: `Saved. ${summary}` };
}

export async function clearActiveTabAction(): Promise<void> {
  await requireSuperadmin();
  await clearActiveTab(getDb());
  revalidatePath("/admin");
}

export async function clearActiveSheetAction(): Promise<void> {
  await requireSuperadmin();
  await clearActiveSheet(getDb());
  revalidatePath("/admin");
}

export type SheetDetails =
  | {
    reachable: true;
    title: string | null;
    /** Link straight to the tab, when its gid is known. */
    tabUrl: string | null;
    /** `null` when no tab is set. */
    rooms: RoomBlock[] | null;
    problem: string | null;
  }
  | { reachable: false; message: string };

/**
 * Live title, tab and rooms of the active sheet, read as this superadmin.
 * Run on demand from /admin rather than on page load, since it calls Sheets.
 */
export async function loadActiveSheetDetailsAction(): Promise<SheetDetails> {
  const session = await auth();
  if (session?.user?.role !== "superadmin") {
    return { reachable: false, message: "Only superadmins can read the active sheet." };
  }
  const active = await getActiveSheet(getDb());
  if (!active) return { reachable: false, message: "No active sheet is set." };
  const google = await getGoogleAccess();
  if (!google.ok) {
    return { reachable: false, message: "Sign in again and allow spreadsheet access to see its name and rooms." };
  }
  const api = createGoogleSheetsApi({ getAccessToken: async () => google.accessToken });
  if (active.tab === null) {
    try {
      const info = await api.getInfo(active.spreadsheetId);
      return { reachable: true, title: info.title || null, tabUrl: null, rooms: null, problem: null };
    } catch (e) {
      return { reachable: false, message: `Spreadsheet unreachable: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const sheet = openCheckinSheet({ api, spreadsheetId: active.spreadsheetId, tab: active.tab });
  const [info, result] = await Promise.all([sheet.info().catch(() => null), sheet.reloadLayout()]);
  if (!result.reachable) return { reachable: false, message: `Spreadsheet ${result.summary}` };
  const tab = active.tab.toLowerCase();
  const gid = info?.tabs.find((t) => t.title.toLowerCase() === tab)?.gid;
  return {
    reachable: true,
    title: info?.title || null,
    tabUrl: gid === undefined ? null : spreadsheetUrl(active.spreadsheetId, gid),
    rooms: result.layout.blocks,
    problem: result.layout.ok ? null : describeLayout(result.layout),
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { addProctors, parseAndrewIdInput, removeProctor } from "@/lib/users/proctors";

async function requireSuperadmin(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "superadmin") {
    throw new Error("Only superadmins can edit the proctor list.");
  }
}

export interface AddResult {
  added: string[];
  alreadyPresent: string[];
  invalid: string[];
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
  revalidatePath("/admin");
  return {
    added,
    alreadyPresent: valid.filter((id) => !addedSet.has(id)),
    invalid,
  };
}

export async function removeProctorAction(formData: FormData): Promise<void> {
  await requireSuperadmin();
  const andrewId = String(formData.get("andrewId") ?? "");
  await removeProctor(getDb(), andrewId);
  revalidatePath("/admin");
}

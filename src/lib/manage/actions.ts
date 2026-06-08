"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getEntity } from "./entities";
import { buildRow } from "./build-row";

export type ActionState = { error?: string; success?: boolean } | undefined;

export async function createEntity(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const entity = getEntity(slug);
  if (!entity) return { error: "Unknown entity." };

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const { data, errors } = buildRow(entity.fields, raw);
  if (errors.length) return { error: errors.join(" ") };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from(entity.table).insert(data);
  if (error) return { error: error.message };
  revalidatePath(`/manage/${slug}`);
  return { success: true };
}

export async function updateEntity(slug: string, id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const entity = getEntity(slug);
  if (!entity) return { error: "Unknown entity." };
  if (!id) return { error: "Missing id." };

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const { data, errors } = buildRow(entity.fields, raw);
  if (errors.length) return { error: errors.join(" ") };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from(entity.table).update(data).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/manage/${slug}`);
  return { success: true };
}

export async function deleteEntity(slug: string, id: string): Promise<void> {
  await requireAdmin();
  const entity = getEntity(slug);
  if (!entity || !id) return;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from(entity.table).delete().eq("id", id);
  if (error) {
    // No UI surface for a plain delete form; log server-side for diagnosis.
    console.error(`deleteEntity ${slug}/${id} failed: ${error.message}`);
    return;
  }
  revalidatePath(`/manage/${slug}`);
}

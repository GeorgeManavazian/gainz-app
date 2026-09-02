import { supabase } from "@/lib/supabase";
import type { PatternItem, PatternRow } from "@/lib/patterns";

const COLS = "id,name,items,created_at,last_used_at,use_count";

function row(r: Record<string, unknown>): PatternRow {
  return { id: String(r.id), name: String(r.name), items: (r.items as PatternItem[]) ?? [],
    created_at: String(r.created_at), last_used_at: (r.last_used_at as string | null) ?? null,
    use_count: Number(r.use_count ?? 0) };
}

export async function listPatterns(): Promise<PatternRow[]> {
  const { data, error } = await supabase.from("meal_patterns").select(COLS);
  if (error) throw error;
  return (data ?? []).map(row);
}

export async function getPattern(id: string): Promise<PatternRow | null> {
  const { data, error } = await supabase.from("meal_patterns").select(COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? row(data) : null;
}

export async function createPattern(name: string, items: PatternItem[]): Promise<PatternRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase.from("meal_patterns")
    .insert({ user_id: user.id, name: name.trim(), items }).select(COLS).single();
  if (error) throw error;
  return row(data);
}

export async function deletePattern(id: string): Promise<void> {
  const { error } = await supabase.from("meal_patterns").delete().eq("id", id);
  if (error) throw error;
}

/** Cosmetic ordering data; callers may ignore failures. */
export async function markUsed(p: PatternRow): Promise<void> {
  const { error } = await supabase.from("meal_patterns")
    .update({ last_used_at: new Date().toISOString(), use_count: p.use_count + 1 }).eq("id", p.id);
  if (error) throw error;
}

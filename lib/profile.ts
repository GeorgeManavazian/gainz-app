import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/targets";

export type ProfileRow = Profile & { id: string; updated_at: string; last_adjusted_at: string | null };

export async function getProfile(): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    height_in: Number(data.height_in),
    weight_lb: Number(data.weight_lb),
    rate_lb_per_wk: Number(data.rate_lb_per_wk),
    protein_g_per_lb: data.protein_g_per_lb === null ? null : Number(data.protein_g_per_lb),
    tdee_override: data.tdee_override === null ? null : Number(data.tdee_override),
  } as ProfileRow;
}

export async function upsertProfile(p: Profile): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...p, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Record a stall adjustment: new TDEE override + cooldown timestamp. Other fields untouched. */
export async function applyAdjustment(p: ProfileRow, newTdeeOverride: number): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ tdee_override: newTdeeOverride, last_adjusted_at: new Date().toISOString(),
      updated_at: new Date().toISOString() })
    .eq("id", p.id);
  if (error) throw error;
}

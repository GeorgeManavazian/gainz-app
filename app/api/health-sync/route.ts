import { NextRequest, NextResponse } from "next/server";
import { isAuthorized, parseHealthSyncBody } from "@/lib/health-sync";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  if (!isAuthorized(req.headers.get("authorization"), process.env.HEALTH_SYNC_TOKEN!)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const parsed = parseHealthSyncBody(body);
  if (!parsed) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { error } = await supabaseAdmin()
    .from("health_activity")
    .upsert(
      { user_id: process.env.HEALTH_SYNC_USER_ID, date: parsed.date, active_kcal: parsed.active_kcal },
      { onConflict: "user_id,date" }
    );
  if (error) {
    console.error("health-sync upsert failed:", error);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

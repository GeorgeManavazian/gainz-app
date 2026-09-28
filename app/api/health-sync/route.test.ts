import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => ({ from: () => ({ upsert }) }),
}));

process.env.HEALTH_SYNC_TOKEN = "test-token";
process.env.HEALTH_SYNC_USER_ID = "11111111-1111-1111-1111-111111111111";

const { POST } = await import("./route");

function req(body: unknown, token = "test-token"): Request {
  return new Request("http://localhost/api/health-sync", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => { upsert.mockClear(); });

describe("POST /api/health-sync", () => {
  it("401s and never writes when the token is wrong", async () => {
    const res = await POST(req({ date: "2026-09-30", active_kcal: 450 }, "wrong") as any);
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("401s and never writes when the header is missing entirely", async () => {
    const bare = new Request("http://localhost/api/health-sync", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: "2026-09-30", active_kcal: 450 }),
    });
    const res = await POST(bare as any);
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("400s and never writes on a malformed body", async () => {
    const res = await POST(req({ date: "2026-09-30", active_kcal: -5 }) as any);
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts with the fixed user id and 200s on a valid, authorized request", async () => {
    const res = await POST(req({ date: "2026-09-30", active_kcal: 450 }) as any);
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "11111111-1111-1111-1111-111111111111", date: "2026-09-30", active_kcal: 450 },
      { onConflict: "user_id,date" }
    );
  });
});

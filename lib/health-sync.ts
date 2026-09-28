const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Expects `Authorization: Bearer <token>` exactly — no other scheme accepted. */
export function isAuthorized(header: string | null, token: string): boolean {
  return header === `Bearer ${token}`;
}

/** Validates and narrows an unknown POST body for /api/health-sync. */
export function parseHealthSyncBody(body: unknown): { date: string; active_kcal: number } | null {
  if (typeof body !== "object" || body === null) return null;
  const { date, active_kcal } = body as Record<string, unknown>;
  if (typeof date !== "string" || !DATE_RE.test(date)) return null;
  if (typeof active_kcal !== "number" || !Number.isFinite(active_kcal) || active_kcal < 0) return null;
  return { date, active_kcal };
}

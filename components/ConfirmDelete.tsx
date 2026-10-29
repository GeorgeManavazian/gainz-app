// components/ConfirmDelete.tsx
"use client";
import { useEffect, useState } from "react";

/** ✕ → "Delete?" → onConfirm. Arms for 4 s; resets when `resetKey` changes. */
export default function ConfirmDelete({ label, onConfirm, resetKey }: {
  label: string; onConfirm: () => Promise<void> | void; resetKey?: string | number;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setArmed(false); }, [resetKey]);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
  }

  return armed ? (
    <button type="button" onClick={confirm} disabled={busy} aria-label={`Confirm delete ${label}`}
      className="h-8 shrink-0 rounded-md bg-danger/15 px-2 text-xs font-semibold text-danger active:opacity-80 disabled:opacity-60">
      Delete?
    </button>
  ) : (
    <button type="button" onClick={() => setArmed(true)} aria-label={`Remove ${label}`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted active:bg-surface-2">
      ✕
    </button>
  );
}

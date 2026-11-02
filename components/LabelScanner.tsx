// components/LabelScanner.tsx
"use client";
import { useRef, useState } from "react";
import { parseNutritionLabel, type ParsedLabel } from "@/lib/label-parse";

/** Downscale + grayscale + mild contrast so Tesseract gets a clean, small image. */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); // honour the phone's EXIF rotation
  const max = 1800, scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * 1.25 + 128)); // mild contrast
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Runs OCR on the device (tesseract.js, lazy-loaded). Nothing leaves the phone. */
export async function readLabel(file: File, onProgress?: (pct: number) => void): Promise<{ text: string; parsed: ParsedLabel }> {
  const canvas = await prepare(file);
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text" && onProgress) onProgress(Math.round(m.progress * 100)); },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN }); // label = one column of mixed sizes
    const { data } = await worker.recognize(canvas);
    return { text: data.text, parsed: parseNutritionLabel(data.text) };
  } finally {
    await worker.terminate();
  }
}

/** Camera button; hands the parsed label (or a failure) to the parent. */
export default function LabelScanner({ onParsed, className, label = "Scan label" }: {
  onParsed: (parsed: ParsedLabel | null) => void; className?: string; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("Reading label…");
    try {
      const { parsed } = await readLabel(file, (pct) => setBusy(`Reading label… ${pct}%`));
      onParsed(parsed);
    } catch (err) {
      console.warn("gainz label scan failed", err);
      onParsed(null);
    } finally { setBusy(null); }
  }

  return (
    <>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <button type="button" onClick={() => input.current?.click()} disabled={busy !== null} aria-label="Scan nutrition label"
        className={className ?? "flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 text-[13px] font-semibold text-muted active:text-foreground disabled:opacity-60"}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><rect x="8" y="9" width="8" height="6" rx="1" />
        </svg>
        {busy ?? label}
      </button>
    </>
  );
}

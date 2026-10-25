"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { parseScan, type ScanField, type ScanResult } from "@/lib/ocr/extract";

// Scanning runs entirely in this browser (Tesseract.js + pdf.js). The ID image is never sent to the server.
// Only the user-reviewed field values, the redacted OCR text and the confidence are passed to onApply.
export type ScanApply = { raw: string; confidence: number; values: Partial<Record<ScanField, string>> };
const FIELDS: ScanField[] = ["name", "enrollment_no", "programme", "year", "institution"];
const MAX_SIDE = 2000;

async function loadCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; smallImage: boolean }> {
  const canvas = document.createElement("canvas");
  if (file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, MAX_SIDE / Math.max(base.width, base.height)) });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return { canvas, smallImage: false };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { canvas, smallImage: Math.min(bitmap.width, bitmap.height) < 300 };
}

// Grayscale and a contrast stretch: makes printed card text easier for Tesseract.
function preprocess(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const v = Math.min(255, Math.max(0, (gray - 128) * 1.4 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  context.putImageData(image, 0, 0);
}

export function IdScan({ onApply }: { onApply: (payload: ScanApply) => void }) {
  const t = useTranslations("scan"), common = useTranslations("common");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [warning, setWarning] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null), [values, setValues] = useState<Partial<Record<ScanField, string>>>({});

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function run(file: File) {
    setBusy(true); setError(""); setScan(null); setWarning("");
    try {
      const { canvas, smallImage } = await loadCanvas(file);
      if (smallImage) setWarning(t("smallImage"));
      preprocess(canvas);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["eng", "hin"]);
      try {
        const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
        const d = data as unknown as { text?: string; confidence?: number; lines?: { text: string; confidence: number }[] };
        const parsed = parseScan(d.text ?? "", d.confidence ?? 0, d.lines ?? []);
        setScan(parsed);
        const prefill: Partial<Record<ScanField, string>> = {};
        if (!parsed.fallback) for (const field of FIELDS) { const hit = parsed.fields[field]; if (hit && hit.band !== "low") prefill[field] = hit.value; }
        setValues(prefill);
      } finally { await worker.terminate(); }
    } catch {
      setError(t("failed"));
    } finally { setBusy(false); }
  }

  function onPick(file: File | undefined) {
    if (!file) return;
    setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    void run(file);
  }

  const badgeText = { high: t("high"), medium: t("medium"), low: t("low") } as const;
  const labels: Record<ScanField, string> = { name: t("name"), enrollment_no: t("enrollment"), programme: t("programme"), year: t("year"), institution: t("institution") };

  return <section className="p4-card" aria-label={t("choose")}>
    <p className="muted">{common("realOcr")}</p>
    <input type="file" accept="image/*,application/pdf" aria-label={t("choose")} onChange={e => onPick(e.target.files?.[0])} disabled={busy} />
    {busy && <p role="status">{t("processing")}</p>}
    {warning && <p className="p4-warning" role="status">{warning}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {scan?.aadhaarFound && <p className="p4-warning" role="alert">{t("aadhaar")}</p>}
    {scan && scan.fallback && <p className="p4-banner" role="status">{t("fallback")}</p>}
    {scan && !scan.fallback && <div className="p4-form">
      {preview && <img src={preview} alt="" style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain" }} />}
      {FIELDS.map(field => {
        const hit = scan.fields[field];
        return <label key={field}>{labels[field]} {hit && <small className={hit.band === "high" ? "p4-badge" : hit.band === "medium" ? "p4-warning" : "error"}>{badgeText[hit.band]}</small>}
          <input value={values[field] ?? ""} onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))} maxLength={200} />
        </label>;
      })}
      <button type="button" onClick={() => onApply({ raw: scan.raw, confidence: scan.confidence / 100, values })}>{t("apply")}</button>
    </div>}
  </section>;
}

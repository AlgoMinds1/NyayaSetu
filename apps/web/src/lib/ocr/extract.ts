// Pure parsing for the on-device ID scan. No DOM, no network: safe to run anywhere.
// Thresholds follow the OCR deep dive (plan section 6.3): >=80 auto-fill, 50-79 check, <50 blank, average <40 manual.

export type ScanField = "name" | "enrollment_no" | "programme" | "year" | "institution";
export type ScanLine = { text: string; confidence: number };
export type ScanValue = { value: string; confidence: number; band: "high" | "medium" | "low" };
export type ScanResult = { raw: string; confidence: number; fields: Partial<Record<ScanField, ScanValue>>; aadhaarFound: boolean; fallback: boolean };

const AADHAAR = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const PROGRAMME = /\b(B\.?\s?Tech|M\.?\s?Tech|B\.?\s?E\.?|M\.?\s?E\.?|B\.?\s?Sc\.?|M\.?\s?Sc\.?|BCA|MCA|MBA|B\.?\s?Com\.?|M\.?\s?Com\.?|B\.?\s?A\.?|M\.?\s?A\.?|Diploma|Ph\.?\s?D\.?)\b.*$/i;
const ENROLLMENT = /(?:enrol(?:l)?ment|enr\.?|roll|reg(?:istration)?)\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([A-Za-z0-9\/-]{3,40})/i;
const YEAR = /\b((?:1st|2nd|3rd|4th|first|second|third|fourth)\s*year)\b|\byear\s*[:\-]?\s*([1-6])\b/i;
const NAME = /\bname\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{1,80})/i;
const INSTITUTION = /(institute|college|university|vidyalaya|school)/i;

export function redactAadhaar(text: string) {
  return text.replace(AADHAAR, "XXXX XXXX XXXX");
}

export function bandFor(confidence: number): ScanValue["band"] {
  return confidence >= 80 ? "high" : confidence >= 50 ? "medium" : "low";
}

function lineMatch(lines: ScanLine[], pattern: RegExp): { value: string; confidence: number } | null {
  for (const line of lines) {
    const match = line.text.match(pattern);
    if (!match) continue;
    const raw = match[1] ?? match[0];
    const value = raw.replace(/\s+/g, " ").trim().slice(0, 120);
    if (value) return { value, confidence: line.confidence };
  }
  return null;
}

/** Parses OCR output. Lines carry word-level confidence from Tesseract; without them the average is used. */
export function parseScan(rawText: string, rawConfidence: number, lines: ScanLine[]): ScanResult {
  const aadhaarFound = new RegExp(AADHAAR.source).test(rawText);
  const redacted = redactAadhaar(rawText);
  const source: ScanLine[] = lines.length ? lines.map((l) => ({ ...l, text: redactAadhaar(l.text) })) : redacted.split(/\n+/).map((text) => ({ text, confidence: rawConfidence }));
  const confidence = Math.round(rawConfidence);
  const fields: ScanResult["fields"] = {};

  const candidates: [ScanField, { value: string; confidence: number } | null][] = [
    ["name", lineMatch(source, NAME)],
    ["enrollment_no", lineMatch(source, ENROLLMENT)],
    ["programme", lineMatch(source, PROGRAMME)],
    ["year", lineMatch(source, YEAR)],
    ["institution", lineMatch(source, INSTITUTION)],
  ];
  for (const [field, hit] of candidates) {
    if (!hit) continue;
    const conf = Math.round(hit.confidence);
    fields[field] = { value: hit.value, confidence: conf, band: bandFor(conf) };
  }
  return { raw: redacted, confidence, fields, aadhaarFound, fallback: confidence < 40 };
}

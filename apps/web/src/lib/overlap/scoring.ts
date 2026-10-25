// Pure scoring for Alert 2 (potentially related cases). No I/O, safe to import anywhere.

export const RELATED_THRESHOLD = 0.5;  // match strength at or above which Alert 2 fires (best F1 in docs/overlap-eval.md)
export const COSINE_GATE = 0.5;        // embedding cosine below this caps the score under the threshold
const DATE_HALF_LIFE_DAYS = 14;

// Weights sum to 1.0. Category + date + cross-bureau alone top out at 0.40, below the threshold.
export const WEIGHTS = {
  category:   0.15,
  cosine:     0.35,
  date:       0.10,
  entities:   0.15,
  attachment: 0.10,
  bureau:     0.15,
} as const;

export type FactorName = keyof typeof WEIGHTS;

export type ScorableComplaint = {
  text: string;
  category: string;
  bureau: string | null;
  date: string | null;               // ISO date (receipt_date)
  embedding?: number[] | null;       // 768-dim, normalised
  attachmentHashes?: string[];       // sha256 hex of evidence files
};

export type Factor = { name: FactorName; label: string; value: number; weight: number; contribution: number };

export type PairScore = { score: number; related: boolean; gated: boolean; factors: Factor[] };

const LABELS: Record<FactorName, string> = {
  category:   "Same category",
  cosine:     "Text similarity (embedding cosine)",
  date:       "Filing-date proximity (14-day half-life)",
  entities:   "Shared entities (programme, role, building)",
  attachment: "Identical attachment hash",
  bureau:     "Different bureau",
};

// ── Entity extraction ────────────────────────────────────────────────────────

const ENTITY_PATTERNS: Array<[RegExp, (m: string) => string]> = [
  [/\b(b\.?\s?tech|m\.?\s?tech|mba|mca|bca|b\.?\s?arch|ph\.?\s?d|b\.?\s?pharm|b\.?\s?sc|m\.?\s?sc|bba|diploma)\b/gi,
    m => m.replace(/[^a-z]/gi, "").toLowerCase()],
  [/\b(principal|director|warden|dean|registrar|chairman|proctor|librarian|head of (the )?department|placement (officer|cell)|professor)\b/gi,
    m => (/^head of/i.test(m) ? "hod" : m.toLowerCase().replace(/\s+/g, "_"))],
  [/\b(hostel|mess|canteen|cafeteria|library|laborator(y|ies)|labs?|block|building|workshop|gymkhana|auditorium|classroom|campus)\b/gi,
    m => (/^lab/i.test(m) ? "lab" : m.toLowerCase())],
];

const HINDI_ENTITIES: Array<[string, string]> = [
  ["प्राचार्य", "principal"], ["वार्डन", "warden"], ["विभागाध्यक्ष", "hod"],
  ["छात्रावास", "hostel"], ["पुस्तकालय", "library"], ["प्रयोगशाला", "lab"],
];

export function extractEntities(text: string): string[] {
  const found = new Set<string>();
  for (const [re, normalise] of ENTITY_PATTERNS) {
    for (const m of text.matchAll(re)) found.add(normalise(m[0]));
  }
  for (const [word, canonical] of HINDI_ENTITIES) {
    if (text.includes(word)) found.add(canonical);
  }
  return [...found];
}

// ── Factors ──────────────────────────────────────────────────────────────────

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter(x => setB.has(x)).length;
  return shared / Math.min(new Set(a).size, new Set(b).size);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export function scorePair(a: ScorableComplaint, b: ScorableComplaint): PairScore {
  const cosineValue = a.embedding && b.embedding ? Math.min(1, Math.max(0, cosine(a.embedding, b.embedding))) : 0;

  let dateValue = 0;
  if (a.date && b.date) {
    const days = Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) / 86_400_000;
    dateValue = Math.pow(2, -days / DATE_HALF_LIFE_DAYS);
  }

  const hashesA = a.attachmentHashes ?? [];
  const hashesB = b.attachmentHashes ?? [];
  const values: Record<FactorName, number> = {
    category:   a.category === b.category ? 1 : 0,
    cosine:     cosineValue,
    date:       dateValue,
    entities:   overlapRatio(extractEntities(a.text), extractEntities(b.text)),
    attachment: overlapRatio(hashesA, hashesB) > 0 ? 1 : 0,
    bureau:     a.bureau && b.bureau && a.bureau !== b.bureau ? 1 : 0,
  };

  const factors: Factor[] = (Object.keys(WEIGHTS) as FactorName[]).map(name => ({
    name,
    label: LABELS[name],
    value: values[name],
    weight: WEIGHTS[name],
    contribution: values[name] * WEIGHTS[name],
  }));

  let score = factors.reduce((sum, f) => sum + f.contribution, 0);

  // Cosine is required: without a semantic match, other factors alone cannot reach the threshold.
  const gated = cosineValue < COSINE_GATE;
  if (gated) score = Math.min(score, RELATED_THRESHOLD - 0.01);

  return { score, related: score >= RELATED_THRESHOLD, gated, factors };
}

// ── Shared phrases ───────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  "a an the and or but of to in on for at by from with as is are was were be been it its this that these those not no has have had i we our my they their there which who when where so if do did".split(" ")
);

// \p{M} keeps Devanagari vowel signs inside words.
function tokens(s: string): string[] {
  return s.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

/** Maximal runs of at least `minWords` identical words shared by both texts (stopword-only runs ignored). */
export function highlightSharedPhrases(a: string, b: string, minWords = 3): string[] {
  const ta = tokens(a);
  const tb = tokens(b);
  const found = new Set<string>();

  for (let i = 0; i < ta.length; i++) {
    for (let j = 0; j < tb.length; j++) {
      if (ta[i] !== tb[j]) continue;
      if (i > 0 && j > 0 && ta[i - 1] === tb[j - 1]) continue; // not the start of a run
      let k = 0;
      while (i + k < ta.length && j + k < tb.length && ta[i + k] === tb[j + k]) k++;
      if (k < minWords) continue;
      const run = ta.slice(i, i + k);
      if (run.every(w => STOPWORDS.has(w))) continue;
      found.add(run.join(" "));
    }
  }

  // Drop phrases contained in a longer shared phrase.
  const all = [...found].sort((x, y) => y.length - x.length);
  return all.filter((p, idx) => !all.slice(0, idx).some(longer => longer.includes(p)));
}

import { describe, expect, it } from "vitest";
import { COSINE_GATE, RELATED_THRESHOLD, scorePair, type ScorableComplaint } from "@/lib/overlap/scoring";

const base: ScorableComplaint = { text: "Hostel fee charged twice this semester", category: "financial", bureau: "PGRC", date: "2026-10-01" };

describe("overlap scoring", () => {
  it("fires when embedding cosine, text and dates all agree", () => {
    const a = { ...base, embedding: [1, 0] };
    const b = { ...base, bureau: "RB", embedding: [1, 0] };
    const result = scorePair(a, b);
    expect(result.gated).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(RELATED_THRESHOLD);
    expect(result.related).toBe(true);
  });

  it("caps the score below threshold when cosine is under the gate, even with every other factor", () => {
    const a = { ...base, embedding: [1, 0] };
    const b = { ...base, bureau: "RB", embedding: [0, 1] };
    const result = scorePair(a, b);
    expect(COSINE_GATE).toBeGreaterThan(0);
    expect(result.gated).toBe(true);
    expect(result.related).toBe(false);
    expect(result.score).toBeLessThan(RELATED_THRESHOLD);
  });

  it("does not fire on category and date alone", () => {
    const a = { ...base, text: "Fee refund pending", embedding: null };
    const b = { ...base, text: "Scholarship not paid", bureau: "RB", embedding: null };
    const result = scorePair(a, b);
    expect(result.related).toBe(false);
    expect(result.score).toBeLessThan(RELATED_THRESHOLD);
  });

  it("keeps the score under threshold for matching category, date and cross-bureau without embeddings", () => {
    const a = { ...base, text: "alpha beta gamma", embedding: null };
    const b = { ...base, text: "delta epsilon zeta", bureau: "RB", embedding: null };
    expect(scorePair(a, b).score).toBeLessThan(RELATED_THRESHOLD);
  });

  it("reports one factor row per weight with contributions that sum to the score", () => {
    const result = scorePair({ ...base, embedding: [1, 0] }, { ...base, embedding: [1, 0] });
    expect(result.factors).toHaveLength(6);
    const sum = result.factors.reduce((total, f) => total + f.contribution, 0);
    expect(sum).toBeCloseTo(result.score, 10);
  });
});

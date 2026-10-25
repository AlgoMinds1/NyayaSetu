// POST /api/overlap/detect
// Scans complaints and generates Alert 1 (cross-bureau) and Alert 2 (related cases).
// Idempotent — safe to call multiple times; any existing alert (open, linked, dismissed or reopened)
// for the same type + institution + complaint set is never recreated. Dismissed pairs are skipped.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { embed } from "@/lib/overlap/embeddings";
import { scorePair, type PairScore } from "@/lib/overlap/scoring";

const TERMINAL = ["closed", "appeal_decided", "out_of_scope"];
const ALERT1_MIN_BUREAUS  = 2;    // at least 2 distinct bureaus at same institution

const pairKey = (a: string, b: string) => [a, b].sort().join(",");

// pgvector comes back from PostgREST as a string such as "[0.1,0.2,...]".
function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    return null;
  }
}

// Stored alongside the alert. `match_strength`, `same_category`, `date_proximity`, `different_bureaus`
// and `text_similarity` keep the keys the Alert Centre already reads.
function matchFactors(score: PairScore) {
  const value = (name: string) => score.factors.find(f => f.name === name)?.value ?? 0;
  return {
    match_strength:   Math.round(score.score * 100) / 100,
    same_category:    value("category") === 1,
    date_proximity:   Math.round(value("date") * 100) / 100,
    different_bureaus: value("bureau") === 1,
    text_similarity:  Math.round(value("cosine") * 100) / 100,
    gated:            score.gated,
    factors:          score.factors.map(({ name, value, weight, contribution }) => ({ name, value, weight, contribution })),
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only officers can trigger detection
  const role = req.headers.get("x-user-role") ?? "";
  const allowed = ["pgrc_triage_officer","bureau_officer","bureau_head","system_admin"];
  if (!allowed.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Load all non-terminal complaints with institution, bureau, text and embedding
  const { data: complaints, error } = await supabase
    .from("complaints")
    .select("id, institution_id, category, assigned_bureau, receipt_date, description_text, description_embedding")
    .not("status", "in", `(${TERMINAL.map(s => `"${s}"`).join(",")})`)
    .not("assigned_bureau", "is", null);

  if (error || !complaints) return NextResponse.json({ error: "Failed to load complaints" }, { status: 500 });

  // Every alert, whatever its status, blocks re-creating the same type + complaint set
  const { data: existingAlerts } = await supabase
    .from("overlap_alerts")
    .select("id, institution_id, complaint_ids, alert_type");

  const existingKeys = new Set(
    (existingAlerts ?? []).map(a =>
      `${a.alert_type}:${a.institution_id}:${[...a.complaint_ids].sort().join(",")}`
    )
  );

  const { data: dismissed } = await supabase
    .from("dismissed_pairs")
    .select("complaint_a_id, complaint_b_id");
  const dismissedKeys = new Set((dismissed ?? []).map(d => pairKey(d.complaint_a_id, d.complaint_b_id)));

  // Attachment hashes per complaint (identical file = strong signal)
  const { data: evidence } = await supabase
    .from("evidence")
    .select("complaint_id, hash_sha256")
    .in("complaint_id", complaints.map(c => c.id));
  const hashesByComplaint = new Map<string, string[]>();
  for (const e of evidence ?? []) {
    hashesByComplaint.set(e.complaint_id, [...(hashesByComplaint.get(e.complaint_id) ?? []), e.hash_sha256]);
  }

  // Embeddings: use stored vectors; compute and store missing ones. If the model is down, skip Alert 2 for this run.
  const admin = createAdminClient();
  const embeddings = new Map<string, number[]>();
  let embedderDown = false;
  async function ensureEmbedding(c: NonNullable<typeof complaints>[number]) {
    let vector = parseVector(c.description_embedding);
    if (!vector && !embedderDown) {
      try {
        vector = await embed(c.description_text);
        const { error: saveError } = await admin
          .from("complaints")
          .update({ description_embedding: JSON.stringify(vector) })
          .eq("id", c.id);
        if (saveError) console.error("[overlap] could not store embedding:", saveError.message);
      } catch (err) {
        embedderDown = true;
        console.error("[overlap] embedding unavailable, Alert 2 skipped:", err);
      }
    }
    if (vector) embeddings.set(c.id, vector);
  }

  // Group by institution
  const byInstitution: Record<string, typeof complaints> = {};
  complaints.forEach(c => {
    if (!byInstitution[c.institution_id]) byInstitution[c.institution_id] = [];
    byInstitution[c.institution_id].push(c);
  });

  const newAlerts: object[] = [];

  for (const [institution_id, cases] of Object.entries(byInstitution)) {
    if (cases.length < 2) continue;

    // ── Alert 1: Cross-bureau coordination ──────────────────────────────
    const bureaus = [...new Set(cases.map(c => c.assigned_bureau).filter(Boolean))];
    if (bureaus.length >= ALERT1_MIN_BUREAUS) {
      const ids = cases.map(c => c.id).sort();
      const key = `coordination:${institution_id}:${ids.join(",")}`;
      if (!existingKeys.has(key)) {
        newAlerts.push({
          institution_id,
          alert_type: "coordination",
          status: "open",
          complaint_ids: ids,
          match_factors: {
            bureaus,
            bureau_count: bureaus.length,
            case_count:   cases.length,
          },
        });
        existingKeys.add(key);
      }
    }

    // ── Alert 2: Potentially related cases ──────────────────────────────
    for (const c of cases) await ensureEmbedding(c);

    for (let i = 0; i < cases.length; i++) {
      for (let j = i + 1; j < cases.length; j++) {
        const a = cases[i];
        const b = cases[j];

        if (dismissedKeys.has(pairKey(a.id, b.id))) continue;

        const embeddingA = embeddings.get(a.id);
        const embeddingB = embeddings.get(b.id);
        if (!embeddingA || !embeddingB) continue;

        const score = scorePair(
          {
            text: a.description_text, category: a.category, bureau: a.assigned_bureau,
            date: a.receipt_date, embedding: embeddingA, attachmentHashes: hashesByComplaint.get(a.id),
          },
          {
            text: b.description_text, category: b.category, bureau: b.assigned_bureau,
            date: b.receipt_date, embedding: embeddingB, attachmentHashes: hashesByComplaint.get(b.id),
          },
        );
        if (!score.related) continue;

        const ids = [a.id, b.id].sort();
        const key = `related:${institution_id}:${ids.join(",")}`;
        if (!existingKeys.has(key)) {
          newAlerts.push({
            institution_id,
            alert_type: "related",
            status: "open",
            complaint_ids: ids,
            match_factors: matchFactors(score),
          });
          existingKeys.add(key);
        }
      }
    }
  }

  if (newAlerts.length > 0) {
    const { error: insertError } = await supabase
      .from("overlap_alerts")
      .insert(newAlerts);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    // Mark involved complaints as possible_overlap
    for (const alert of newAlerts as Array<{ complaint_ids: string[] }>) {
      await supabase
        .from("complaints")
        .update({ coordination_status: "possible_overlap" })
        .in("id", alert.complaint_ids)
        .eq("coordination_status", "no_overlap");
    }
  }

  return NextResponse.json({
    generated: newAlerts.length,
    scanned:   complaints.length,
    message:   `Detection complete. ${newAlerts.length} new alert(s) created.`,
  });
}

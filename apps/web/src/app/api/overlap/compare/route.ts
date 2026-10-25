// GET /api/overlap/compare?a=<uuid>&b=<uuid>
// Returns both complaints (officer-visible fields), the 6-factor score, and shared phrases.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { embed } from "@/lib/overlap/embeddings";
import { highlightSharedPhrases, RELATED_THRESHOLD, scorePair, type ScorableComplaint } from "@/lib/overlap/scoring";

const OFFICER_ROLES = ["pgrc_triage_officer", "bureau_officer", "bureau_head", "system_admin"];
const Query = z.object({ a: z.string().uuid(), b: z.string().uuid() });
const COLUMNS = "id, case_id, category, status, assigned_bureau, receipt_date, description_text, description_language, description_embedding, institutions(name)";

type Row = {
  id: string; case_id: string; category: string; status: string; assigned_bureau: string | null; receipt_date: string;
  description_text: string; description_language: string; description_embedding: string | null;
  institutions: { name: string } | null;
};

function parseVector(value: string | null): number[] | null {
  return value ? (JSON.parse(value) as number[]) : null;
}

function view(row: Row) {
  return {
    id: row.id, case_id: row.case_id, category: row.category, status: row.status,
    assigned_bureau: row.assigned_bureau, receipt_date: row.receipt_date,
    description_text: row.description_text, description_language: row.description_language,
    institution: row.institutions?.name ?? null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!OFFICER_ROLES.includes(auth.session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success || q.data.a === q.data.b) return NextResponse.json({ error: "Provide two different complaint ids as a and b" }, { status: 400 });

  const { supabase } = auth;
  const { data: rows, error } = await supabase.from("complaints").select(COLUMNS).in("id", [q.data.a, q.data.b]);
  if (error) return NextResponse.json({ error: "Failed to load complaints" }, { status: 500 });

  const rowA = (rows as unknown as Row[] | null)?.find(r => r.id === q.data.a);
  const rowB = (rows as unknown as Row[] | null)?.find(r => r.id === q.data.b);
  if (!rowA || !rowB) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: evidence } = await supabase.from("evidence").select("complaint_id, hash_sha256").in("complaint_id", [rowA.id, rowB.id]);
  const hashesFor = (id: string) => (evidence ?? []).filter(e => e.complaint_id === id).map(e => e.hash_sha256 as string);

  const toScorable = async (row: Row): Promise<ScorableComplaint> => ({
    text: row.description_text,
    category: row.category,
    bureau: row.assigned_bureau,
    date: row.receipt_date,
    // Fall back to computing on the fly when the backfill has not reached this complaint yet.
    embedding: parseVector(row.description_embedding) ?? (await embed(row.description_text)),
    attachmentHashes: hashesFor(row.id),
  });

  const scored = scorePair(await toScorable(rowA), await toScorable(rowB));

  return NextResponse.json({
    a: view(rowA),
    b: view(rowB),
    score: scored.score,
    related: scored.related,
    gated: scored.gated,
    threshold: RELATED_THRESHOLD,
    factors: scored.factors,
    sharedPhrases: highlightSharedPhrases(rowA.description_text, rowB.description_text),
  });
}

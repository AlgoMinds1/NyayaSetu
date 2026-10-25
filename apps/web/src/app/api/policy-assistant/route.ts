// POST /api/policy-assistant { question } — officer roles only.
// Retrieval only: top passages from policy_chunks are returned verbatim with citations. No LLM is called.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { ROUTE_ROLE, type Role } from "@/lib/auth/roles";
import { embed } from "@/lib/overlap/embeddings";
import { ABSTAIN_MESSAGE, MAX_PASSAGES, PROCEDURE_ONLY_MESSAGE, isValidityQuestion, selectPassages, type Match } from "@/lib/rag/policy";

export const SIMULATED_LABEL = "Simulated LLM — extractive answer";
const OFFICER_ROLES = ROUTE_ROLE["/aicte"] as Role[];
const Body = z.object({ question: z.string().trim().min(3).max(500) });

export async function POST(req: NextRequest) {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!OFFICER_ROLES.includes(auth.session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Question must be 3 to 500 characters" }, { status: 400 });
  const { question } = parsed.data;

  if (isValidityQuestion(question)) {
    return NextResponse.json({ mode: "procedure_only", answer: PROCEDURE_ONLY_MESSAGE, passages: [] });
  }

  const vector = await embed(question);
  const { data, error } = await auth.supabase.rpc("match_policy_chunks", {
    query_embedding: `[${vector.join(",")}]`, k: MAX_PASSAGES + 2,
  });
  if (error) return NextResponse.json({ error: "Policy search failed" }, { status: 500 });

  const passages = selectPassages((data ?? []) as Match[]);
  if (passages.length === 0) {
    return NextResponse.json({ mode: "abstained", answer: ABSTAIN_MESSAGE, passages: [] });
  }
  return NextResponse.json({ mode: "extractive", label: SIMULATED_LABEL, answer: null, passages });
}

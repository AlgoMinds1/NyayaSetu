// POST /api/complaints/[id]/embedding — compute and store the description embedding for one complaint.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { embed } from "@/lib/overlap/embeddings";

const OFFICER_ROLES = ["pgrc_triage_officer", "bureau_officer", "bureau_head", "system_admin"];
const Params = z.object({ id: z.string().uuid() });

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!OFFICER_ROLES.includes(auth.session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const p = Params.safeParse(await params);
  if (!p.success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("complaints")
    .select("id, description_text")
    .eq("id", p.data.id)
    .maybeSingle();
  if (error || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const vector = await embed(row.description_text);
  const { error: updateError } = await admin
    .from("complaints")
    .update({ description_embedding: JSON.stringify(vector) })
    .eq("id", row.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ id: row.id, dimensions: vector.length });
}

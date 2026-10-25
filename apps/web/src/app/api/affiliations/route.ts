import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
import { matchRoster } from "@/lib/affiliations/roster";

const Body = z.object({
  institution_id: z.string().uuid(),
  enrollment_no: z.string().trim().regex(/^[A-Za-z0-9\/-]{3,40}$/, "Enter a valid enrollment number."),
  programme: z.string().trim().min(2).max(120),
  type: z.enum(["current", "alumnus"]),
  // Optional on-device OCR result. Only text and user-corrected fields arrive here; the ID image is never uploaded.
  ocr: z.object({
    raw: z.string().max(20000),
    confidence: z.number().min(0).max(1),
    corrected: z.record(z.string().max(40), z.string().max(200)),
  }).optional(),
});
const AADHAAR = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;

export async function GET() {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (auth.session.role !== "student") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await auth.supabase.from("affiliations")
    .select("id,institution_id,type,status,enrollment_no,programme,claimed_at,reviewed_at,institutions(name)")
    .eq("user_id", auth.session.userId).order("claimed_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ affiliations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (auth.session.role !== "student") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { institution_id, enrollment_no, programme, type, ocr } = parsed.data;
  const userId = auth.session.userId, type_db = type === "current" ? "current_student" : "alumnus";
  const admin = createAdminClient();

  const { data: institution } = await admin.from("institutions").select("id").eq("id", institution_id).eq("status", "active").is("deleted_at", null).maybeSingle();
  if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 404 });
  const { data: existing, error: existingError } = await admin.from("affiliations").select("id").eq("user_id", userId).eq("institution_id", institution_id).eq("type", type_db).neq("status", "unable_to_verify").maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) return NextResponse.json({ error: "You already have an active claim for this institution." }, { status: 409 });

  let match;
  try { match = await matchRoster(admin, { institutionId: institution_id, userId, enrollmentNo: enrollment_no, programme, alumnus: type === "alumnus" }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Roster check failed." }, { status: 500 }); }

  const { data: affiliation, error: insertError } = await admin.from("affiliations").insert({
    user_id: userId, institution_id, type: type_db, enrollment_no, programme, status: match.verdict,
  }).select("id,institution_id,type,status,enrollment_no,programme,claimed_at").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  const { error: attemptError } = await admin.from("verification_attempts").insert({
    affiliation_id: affiliation.id, method: ocr ? "document" : "roster", outcome: match.verdict,
    ocr_raw: ocr ? { text: ocr.raw.replace(AADHAAR, "XXXX XXXX XXXX") } : null,
    user_corrected: ocr ? ocr.corrected : null,
    ocr_confidence: ocr ? ocr.confidence : null,
  });
  if (attemptError) return NextResponse.json({ error: attemptError.message }, { status: 500 });
  await auditLog({ actor_id: userId, action: "affiliation.claimed", resource_type: "affiliation", resource_id: affiliation.id, new_value: { institution_id, type: type_db, status: match.verdict } });
  return NextResponse.json({ affiliation }, { status: 201 });
}

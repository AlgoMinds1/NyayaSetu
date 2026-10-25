import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";

const OFFICER_ROLES = ["pgrc_triage_officer", "bureau_officer", "bureau_head", "regional_officer", "competent_authority", "ombudsperson", "auditor", "system_admin"];
const Fields = z.object({
  name: z.string().trim().min(2).max(120),
  route: z.string().trim().min(2).max(40),
  category: z.enum(["financial", "ragging", "academic", "infrastructure", "other"]).nullable(),
  days_to_deadline: z.number().int().min(1).max(3650),
  source_citation: z.string().trim().min(5, "A source citation is required.").max(500),
  effective_from: z.string().date(),
  is_active: z.boolean(),
});
const CreateBody = Fields.extend({ reason: z.string().trim().min(3).max(1000) }).strict();
const PatchBody = Fields.partial().extend({ id: z.string().uuid(), reason: z.string().trim().min(3).max(1000) }).strict();

export async function GET() {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!OFFICER_ROLES.includes(auth.session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await auth.supabase.from("deadline_rules").select("id,name,route,category,days_to_deadline,source_citation,effective_from,is_active,created_at").order("route");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await getApiSession();
  if (!auth || auth.session.role !== "system_admin" || auth.session.aal !== "aal2") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  const { reason, ...fields } = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin.from("deadline_rules").insert({ ...fields, approved_by: null }).select("*").single();
  if (error || !data) return NextResponse.json({ error: "Could not create rule." }, { status: 500 });
  try {
    await auditLog({ actor_id: auth.session.userId, action: "deadline_rule.created", resource_type: "deadline_rule", resource_id: data.id, new_value: data, reason });
  } catch {
    return NextResponse.json({ error: "Rule saved but audit write failed." }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await getApiSession();
  if (!auth || auth.session.role !== "system_admin" || auth.session.aal !== "aal2") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  const { id, reason, ...changes } = parsed.data;
  const admin = createAdminClient();
  const { data: old } = await admin.from("deadline_rules").select("*").eq("id", id).maybeSingle();
  if (!old) return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  const { data, error } = await admin.from("deadline_rules").update(changes).eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: "Could not update rule." }, { status: 500 });
  try {
    await auditLog({ actor_id: auth.session.userId, action: "deadline_rule.updated", resource_type: "deadline_rule", resource_id: id, old_value: old, new_value: data, reason });
  } catch {
    return NextResponse.json({ error: "Rule saved but audit write failed." }, { status: 500 });
  }
  return NextResponse.json({ data });
}

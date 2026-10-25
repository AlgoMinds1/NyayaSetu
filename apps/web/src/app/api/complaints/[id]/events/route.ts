import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
import { notify } from "@/lib/notify";

const Input = z.object({ event_type: z.enum(["officer_response", "faculty_response", "officer_action", "case_message", "complainant_update", "evidence_added"]), remarks: z.string().max(5000).optional(), evidence_id: z.string().uuid().optional() });
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await getApiSession(); if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: c } = await auth.supabase.from("complaints").select("id,institution_id,submitted_by,involves_management,status").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = auth.session.role;
  if (role === "student" && c.submitted_by !== auth.session.userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "college_management" && (c.institution_id !== auth.session.institutionId || c.involves_management || !["referred", "awaiting_response", "under_examination"].includes(c.status))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let q = auth.supabase.from("case_events").select("id,event_type,actor_role,remarks,event_at,visibility").eq("complaint_id", id).order("event_at", { ascending: true });
  if (role === "student") q = q.in("visibility", ["public", "complainant"]);
  if (role === "college_management") q = q.in("visibility", ["college", "public"]);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const events = (data ?? []).map((e) => role === "student" && ["pgrc_triage_officer", "bureau_officer", "bureau_head"].includes(e.actor_role) ? { ...e, actor_role: "AICTE Officer" } : e);
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await getApiSession(); if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = Input.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.flatten() }, { status: 400 });
  const { id } = await params, { session } = auth, admin = createAdminClient();
  const { data: c } = await admin.from("complaints").select("id,institution_id,submitted_by,involves_management,status,version").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const student = session.role === "student" && c.submitted_by === session.userId;
  const college = session.role === "college_management" && c.institution_id === session.institutionId && !c.involves_management && ["referred", "awaiting_response", "under_examination"].includes(c.status);
  const staffRole = ["faculty", "pgrc_triage_officer", "bureau_officer", "bureau_head", "regional_officer", "competent_authority", "ombudsperson", "auditor", "system_admin"].includes(session.role);
  const { data: staffVisible } = staffRole ? await auth.supabase.from("complaints").select("id").eq("id", id).maybeSingle() : { data: null };
  const staff = staffRole && !!staffVisible;
  if (!student && !college && !staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const type = input.data.event_type;
  if (input.data.evidence_id) {
    const { data: evidence } = await admin.from("evidence").select("id").eq("id", input.data.evidence_id).eq("complaint_id", id).eq("uploaded_by", session.userId).maybeSingle();
    if (!evidence) return NextResponse.json({ error: "Evidence does not belong to this case or session." }, { status: 400 });
  }
  if ((college && !["officer_response", "case_message"].includes(type)) || (student && !["complainant_update", "evidence_added", "case_message"].includes(type)) || (session.role === "faculty" && !["faculty_response", "case_message"].includes(type)) || (staff && session.role !== "faculty" && type !== "officer_action")) return NextResponse.json({ error: "Invalid event for this portal." }, { status: 403 });
  if (["officer_response", "faculty_response", "case_message"].includes(type) && (input.data.remarks?.trim().length ?? 0) < 10) return NextResponse.json({ error: "Please enter at least 10 characters." }, { status: 400 });
  if (student && !["submitted", "under_triage", "referred", "awaiting_response", "under_examination"].includes(c.status)) return NextResponse.json({ error: "This case no longer accepts updates." }, { status: 409 });
  if (college && c.status === "referred") return NextResponse.json({ error: "This referral is not yet awaiting an institution response." }, { status: 409 });

  const now = new Date().toISOString(), payload = { remarks: input.data.remarks ?? null, evidence_id: input.data.evidence_id ?? null };
  const visibility = type === "officer_action" ? "internal" : college && type === "officer_response" ? "college" : type === "case_message" || type === "faculty_response" ? "public" : student ? "complainant" : "internal";
  const { data: event, error } = await admin.from("case_events").insert({ complaint_id: id, event_type: type, actor_id: session.userId, actor_role: session.role, remarks: payload.remarks, new_state: college && type === "officer_response" ? { status: "under_examination" } : null, document_ids: input.data.evidence_id ? [input.data.evidence_id] : [], visibility, event_at: now }).select("id,event_type,actor_role,remarks,event_at,visibility").single();
  if (error || !event) return NextResponse.json({ error: error?.message ?? "Could not record event." }, { status: 500 });
  if (college && type === "officer_response" && c.status === "awaiting_response") {
    const { error: updateError } = await admin.from("complaints").update({ status: "under_examination", last_action_at: now, version: c.version + 1 }).eq("id", id).eq("version", c.version);
    if (updateError) return NextResponse.json({ error: "Response event saved, but case status update failed." }, { status: 500 });
  }
  try { await auditLog({ actor_id: session.userId, action: `complaint.${type}`, resource_type: "complaint", resource_id: id, new_value: payload }); }
  catch { return NextResponse.json({ error: "Event recorded but the audit log could not be written." }, { status: 500 }); }
  void notify({ event_type: "case_message", complaint_id: id, ref: event.id, actor_id: session.userId });
  return NextResponse.json({ event });
}

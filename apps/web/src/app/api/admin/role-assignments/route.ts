import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppSession, hasActiveAppSession } from "@/lib/auth/session";

const Body = z.object({ user_id: z.string().uuid(), role: z.enum(["student","faculty","college_management","pgrc_triage_officer","bureau_officer","regional_officer","bureau_head","competent_authority","ombudsperson","auditor","system_admin"]), institution_id: z.string().uuid().nullable().default(null), bureau: z.string().max(80).nullable().default(null), region: z.string().max(80).nullable().default(null), reason: z.string().min(3).max(1000) }).strict();
export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!await hasActiveAppSession(user.id)) return NextResponse.json({ error: "No active application session." }, { status: 401 });
  const session = await getAppSession(user); if (session?.role !== "system_admin" || session.aal !== "aal2") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin.from("users").select("id,is_active").eq("id", parsed.data.user_id).maybeSingle();
  if (accountError || !account) return NextResponse.json({ error: "User profile must exist before assigning a role." }, { status: 404 });
  if (!account.is_active) return NextResponse.json({ error: "Cannot grant a role to an inactive user." }, { status: 409 });
  const { data, error } = await admin.rpc("admin_grant_role", { p_user_id: parsed.data.user_id, p_role: parsed.data.role, p_institution_id: parsed.data.institution_id, p_bureau: parsed.data.bureau, p_region: parsed.data.region, p_granted_by: user.id, p_reason: parsed.data.reason });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "An equivalent active role already exists." : "Could not grant role." }, { status: 409 });
  return NextResponse.json({ data }, { status: 201 });
}

// Read-only directory for system_admin and auditor (permission matrix: auditor reads the role directory).
export async function GET() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!await hasActiveAppSession(user.id)) return NextResponse.json({ error: "No active application session." }, { status: 401 });
  const session = await getAppSession(user); if (!["system_admin", "auditor"].includes(session?.role ?? "") || session?.aal !== "aal2") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("role_assignments").select("id,role,bureau,region,granted_at,revoked_at,reason,user:users!user_id(email),granter:users!granted_by(email),institution:institutions!institution_id(name)").order("granted_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: "Could not load role assignments." }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

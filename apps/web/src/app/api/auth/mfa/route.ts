import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAppSession, hasActiveAppSession } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit";

const Body = z.object({ factorId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
export async function GET() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!await hasActiveAppSession(user.id)) return NextResponse.json({ error: "No active application session." }, { status: 401 });
  const session = await getAppSession(user); if (!session) return NextResponse.json({ error: "No active portal role." }, { status: 403 });
  if (!["college_management", "pgrc_triage_officer", "bureau_officer", "regional_officer", "bureau_head", "competent_authority", "ombudsperson", "auditor", "system_admin"].includes(session.role)) return NextResponse.json({ error: "MFA is not enabled for this role." }, { status: 403 });
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel === "aal2") return NextResponse.json({ aal2: true });
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return NextResponse.json({ error: "Could not load authenticator factors." }, { status: 502 });
  // Supabase's current SDK types listFactors() as verified-only, but the API can
  // also return an unfinished enrollment with QR/secret values.
  const totpFactors = factors?.totp as Array<{ id: string; status: string; qr_code?: string; secret?: string }> | undefined;
  const verified = totpFactors?.find((item) => item.status === "verified");
  if (verified) return NextResponse.json({ factorId: verified.id });
  const pending = totpFactors?.find((item) => item.status === "unverified");
  if (pending) return NextResponse.json({ factorId: pending.id, qr: pending.qr_code, secret: pending.secret });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `NyayaSetu ${session.role}` });
  if (error || !data) return NextResponse.json({ error: "Could not start authenticator enrollment." }, { status: 502 });
  await auditLog({ action: "auth.mfa_enrollment_started", resource_type: "auth", actor_id: user.id });
  return NextResponse.json({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
}
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a 6-digit code." }, { status: 400 });
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!await hasActiveAppSession(user.id)) return NextResponse.json({ error: "No active application session." }, { status: 401 });
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) { await auditLog({ action: "auth.mfa_failed", resource_type: "auth", actor_id: user.id, reason: error.code }); return NextResponse.json({ error: "Authenticator code is invalid or expired." }, { status: 401 }); }
  await auditLog({ action: "auth.mfa_verified", resource_type: "auth", actor_id: user.id });
  return NextResponse.json({ verified: true, redirectTo: "/" });
}

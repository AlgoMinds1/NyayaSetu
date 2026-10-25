import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppSession } from "@/lib/auth/session";
import { destinationFor } from "@/lib/auth/redirect";
import { auditLog } from "@/lib/audit";
import { DEMO_DOMAIN } from "@/lib/auth/demo";
import { autoCompleteMfa } from "@/lib/auth/demo-mfa";
import { hasRequiredMfa } from "@/lib/auth/roles";

const Body = z.object({ email: z.string().email().max(254), token: z.string().min(6).max(10).regex(/^\d+$/) }).strict();
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or code." }, { status: 400 });
  let stage = "connecting to the authentication service";
  try {
  const supabase = await createClient();
  stage = "checking the one-time code";
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" });
  if (error || !data.user) {
    await auditLog({ action: "auth.login_failed", resource_type: "auth", reason: error?.code ?? "invalid_otp" });
    return NextResponse.json({ error: "The code is invalid or expired." }, { status: 401 });
  }
  stage = "loading the account's portal access";
  const session = await getAppSession(data.user);
  if (!session) {
    await supabase.auth.signOut();
    // An Auth identity without a public.users row cannot be used as an audit
    // actor because audit_events.actor_id references public.users(id). Keep the
    // rejection auditable without violating that foreign key.
    await auditLog({ action: "auth.login_rejected_unprovisioned", resource_type: "auth", reason: "verified_auth_user_without_active_portal_role" });
    return NextResponse.json({ error: "This account has no active portal role. Contact your administrator." }, { status: 403 });
  }
  // Testing only: privileged demo accounts complete MFA automatically (never in
  // production). Student and faculty roles do not require MFA, so avoid enrolling
  // or replacing authenticator factors for those users.
  if (process.env.NODE_ENV !== "production" && parsed.data.email.toLowerCase().endsWith(DEMO_DOMAIN) && hasRequiredMfa(session.role, session.aal)) {
    stage = "completing demo authenticator setup";
    await autoCompleteMfa(supabase, createAdminClient(), data.user.id);
  }
  stage = "registering the secure portal session";
  const sessionId = randomUUID(); const headerStore = await headers(); const admin = createAdminClient();
  const { error: sessionError } = await admin.from("user_sessions").insert({ user_id: data.user.id, auth_session_id: sessionId, user_agent: headerStore.get("user-agent") });
  if (sessionError) {
    await supabase.auth.signOut();
    await auditLog({ action: "auth.session_record_failed", resource_type: "auth", actor_id: data.user.id, reason: sessionError.code });
    return NextResponse.json({ error: "Could not securely register this session. Please retry." }, { status: 500 });
  }
  stage = "recording the sign-in audit event";
  await auditLog({ action: "auth.login_succeeded", resource_type: "auth", actor_id: data.user.id, session_id: sessionId });
  stage = "saving the portal session";
  const cookieStore = await cookies();
  cookieStore.set("nyaya_session", sessionId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
  const redirectTo = destinationFor(session);
  return NextResponse.json({ authenticated: true, redirectTo });
  } catch (error) {
    // Keep the API contract JSON even when a backend dependency (for example,
    // the audit store) is unavailable. The client can then show a useful retry
    // message instead of throwing while parsing an empty Next.js 500 response.
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error(`Auth verification failed while ${stage}`, detail);
    const message = process.env.NODE_ENV === "development"
      ? `Sign-in failed while ${stage}: ${detail}`
      : "We could not complete sign-in right now. Please try again.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

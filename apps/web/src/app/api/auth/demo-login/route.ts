import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/auth/roles";
import { auditLog } from "@/lib/audit";
import { DEMO_DOMAIN } from "@/lib/auth/demo";
import { autoCompleteMfa } from "@/lib/auth/demo-mfa";

const Body = z.object({ email: z.string().email().max(254) }).strict();

// One-shot demo login: generate OTP + verify + MFA + session in a single server call.
// Only works for @nyayasetu.demo / @nyayasetu.test accounts — real emails are rejected.
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email." }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  if (!email.endsWith("@nyayasetu.test") && !email.endsWith("@nyayasetu.demo")) {
    return NextResponse.json({ error: "Demo login is only available for demo accounts." }, { status: 403 });
  }

  try {
    const admin = createAdminClient();

    // Generate magic link to get OTP token
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !linkData?.properties?.email_otp) {
      return NextResponse.json({ error: "Could not generate demo sign-in. Is this email provisioned?" }, { status: 500 });
    }

    const token = linkData.properties.email_otp;

    // Verify OTP to get a real session
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error || !data.user) {
      return NextResponse.json({ error: "Demo sign-in failed: could not verify token." }, { status: 500 });
    }

    const session = await getAppSession(data.user);
    if (!session) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "This demo account has no active portal role." }, { status: 403 });
    }

    // Auto-complete MFA for roles that require it (college, AICTE, etc.)
    await autoCompleteMfa(supabase, admin, data.user.id);

    // Register app session cookie
    const sessionId = randomUUID();
    const headerStore = await headers();
    const { error: sessionError } = await admin.from("user_sessions").insert({
      user_id: data.user.id,
      auth_session_id: sessionId,
      user_agent: headerStore.get("user-agent"),
    });
    if (sessionError) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "Could not register the demo session." }, { status: 500 });
    }

    await auditLog({ action: "auth.demo_login", resource_type: "auth", actor_id: data.user.id, session_id: sessionId });

    const cookieStore = await cookies();
    cookieStore.set("nyaya_session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    const redirectTo = ROLE_HOME[session.role];
    return NextResponse.json({ authenticated: true, redirectTo });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    console.error("Demo login error:", detail);
    return NextResponse.json({ error: "Demo login failed. Please retry." }, { status: 500 });
  }
}

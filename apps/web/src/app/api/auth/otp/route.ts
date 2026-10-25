import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
import { DEMO_CODE_COOKIE, DEMO_DOMAIN, LOGIN_EMAIL_COOKIE } from "@/lib/auth/demo";

const Body = z.object({ email: z.string().email().max(254) }).strict();
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  // Testing only: demo accounts (@nyayasetu.test) can't receive mail, so outside production the code is
  // generated here and handed to the verify page in a short-lived httpOnly cookie. Real emails never take this path.
  if (process.env.NODE_ENV !== "production" && parsed.data.email.toLowerCase().endsWith(DEMO_DOMAIN)) {
    const { data } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email: parsed.data.email });
    const response = withLoginEmail(NextResponse.json({ sent: true }), parsed.data.email);
    const code = data?.properties?.email_otp;
    if (code) response.cookies.set(DEMO_CODE_COOKIE, code, { httpOnly: true, sameSite: "strict", path: "/auth/verify", maxAge: 120 });
    await auditLog({ action: "auth.otp_requested", resource_type: "auth", reason: "demo_autofill" });
    return response;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { shouldCreateUser: false } });

  // Generic response: never reveal whether the email is provisioned or whether delivery failed.
  if (error) {
    await auditLog({ action: "auth.otp_send_failed", resource_type: "auth", reason: error.code ?? "send_failure" });
    return withLoginEmail(NextResponse.json({ sent: true }), parsed.data.email);
  }

  await auditLog({ action: "auth.otp_requested", resource_type: "auth", reason: null });
  return withLoginEmail(NextResponse.json({ sent: true }), parsed.data.email);
}

// Some browsers (e.g. Brave) strip query parameters from URLs, so the verify page also learns the email from this
// short-lived cookie. It only holds the address the user just typed; it grants nothing.
function withLoginEmail(response: NextResponse, email: string) {
  response.cookies.set(LOGIN_EMAIL_COOKIE, email, { httpOnly: true, sameSite: "lax", path: "/auth/verify", maxAge: 600 });
  return response;
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
export async function POST() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("nyaya_session")?.value;
    if (user && sessionId) {
        const admin = createAdminClient();
        await admin.from("user_sessions").update({ revoked_at: new Date().toISOString() }).eq("auth_session_id", sessionId).eq("user_id", user.id);
        await auditLog({ action: "auth.logout", resource_type: "auth", actor_id: user.id, session_id: sessionId });
    }
    await supabase.auth.signOut();
    cookieStore.delete("nyaya_session");
    return NextResponse.json({ signedOut: true });
}

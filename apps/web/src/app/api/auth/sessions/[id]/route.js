import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
import { hasActiveAppSession } from "@/lib/auth/session";
export async function DELETE(_request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (!await hasActiveAppSession(user.id))
        return NextResponse.json({ error: "No active application session." }, { status: 401 });
    const admin = createAdminClient();
    const { data: session, error: readError } = await admin.from("user_sessions").select("id,auth_session_id").eq("id", id).eq("user_id", user.id).is("revoked_at", null).maybeSingle();
    if (readError || !session)
        return NextResponse.json({ error: "Session not found." }, { status: 404 });
    const { error } = await admin.from("user_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
    if (error)
        return NextResponse.json({ error: "Could not revoke session." }, { status: 500 });
    await auditLog({ action: "auth.session_revoked", resource_type: "user_session", resource_id: id, actor_id: user.id, session_id: session.auth_session_id });
    return NextResponse.json({ revoked: true });
}

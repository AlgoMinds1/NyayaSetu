import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppSession, hasActiveAppSession } from "@/lib/auth/session";
const Body = z.object({ reason: z.string().min(3).max(1000) }).strict();
export async function DELETE(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (!await hasActiveAppSession(user.id))
        return NextResponse.json({ error: "No active application session." }, { status: 401 });
    const session = await getAppSession(user);
    if (session?.role !== "system_admin" || session.aal !== "aal2")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
        return NextResponse.json({ error: "A reason is required." }, { status: 400 });
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("admin_revoke_role", { p_assignment_id: id, p_revoked_by: user.id, p_reason: parsed.data.reason });
    if (error)
        return NextResponse.json({ error: error.message.includes("not found") ? "Active role assignment not found." : "Could not revoke role." }, { status: 404 });
    return NextResponse.json({ data });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
// Own in-app notifications only: RLS limits reads to auth.uid() and updates to read_at.
export async function GET() {
    const auth = await getApiSession();
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [{ data: renderedData, error: renderedError }, { count }] = await Promise.all([
        auth.supabase.from("notifications").select("id,complaint_id,event_type,title,body,link,read_at,created_at").eq("channel", "in_app").order("created_at", { ascending: false }).limit(30),
        auth.supabase.from("notifications").select("id", { count: "exact", head: true }).eq("channel", "in_app").is("read_at", null),
    ]);
    let data = (renderedData ?? []);
    if (renderedError) {
        // Rendered fields were added in phase 5; older deployments can still serve
        // notifications from the foundation schema without returning HTTP 500.
        if (renderedError.code !== "42703")
            return NextResponse.json({ error: renderedError.message }, { status: 500 });
        const fallback = await auth.supabase.from("notifications").select("id,complaint_id,event_type,read_at,created_at").eq("channel", "in_app").order("created_at", { ascending: false }).limit(30);
        if (fallback.error)
            return NextResponse.json({ error: fallback.error.message }, { status: 500 });
        data = (fallback.data ?? []);
    }
    const notifications = data.map((item) => {
        const eventType = String(item.event_type ?? "notification");
        const fallbackTitle = eventType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
        const portal = auth.session.role === "student" ? "/student"
            : auth.session.role === "faculty" ? "/faculty"
                : auth.session.role === "college_management" ? "/college"
                    : "/aicte";
        const link = item.complaint_id
            ? `${portal}/cases/${item.complaint_id}`
            : portal;
        return {
            ...item,
            title: typeof item.title === "string" ? item.title : fallbackTitle,
            body: typeof item.body === "string" ? item.body : "Open the related case for details.",
            link: typeof item.link === "string" ? item.link : link,
        };
    });
    return NextResponse.json({ notifications, unread: count ?? 0 });
}
const Body = z.union([z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }), z.object({ all: z.literal(true) })]);
export async function PATCH(req) {
    const auth = await getApiSession();
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    let query = auth.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("channel", "in_app").is("read_at", null);
    if ("ids" in parsed.data)
        query = query.in("id", parsed.data.ids);
    const { error } = await query;
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}

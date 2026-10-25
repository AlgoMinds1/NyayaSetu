import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";

// Own in-app notifications only: RLS limits reads to auth.uid() and updates to read_at.
export async function GET() {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [{ data, error }, { count }] = await Promise.all([
    auth.supabase.from("notifications").select("id,complaint_id,event_type,title,body,link,read_at,created_at").eq("channel", "in_app").order("created_at", { ascending: false }).limit(30),
    auth.supabase.from("notifications").select("id", { count: "exact", head: true }).eq("channel", "in_app").is("read_at", null),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data ?? [], unread: count ?? 0 });
}

const Body = z.union([z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }), z.object({ all: z.literal(true) })]);

export async function PATCH(req: NextRequest) {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  let query = auth.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("channel", "in_app").is("read_at", null);
  if ("ids" in parsed.data) query = query.in("id", parsed.data.ids);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

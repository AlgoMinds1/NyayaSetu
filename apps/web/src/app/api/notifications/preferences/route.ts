import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { NOTIFY_EVENTS } from "@/lib/notify-events";

const CHANNELS = ["in_app", "email", "push"] as const;
const Body = z.object({
  language: z.enum(["en", "hi"]),
  prefs: z.array(z.object({ event_type: z.enum(NOTIFY_EVENTS), channel: z.enum(CHANNELS), enabled: z.boolean() })).max(100),
});

export async function GET() {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await auth.supabase.from("notification_preferences").select("event_type,channel,enabled,language").eq("user_id", auth.session.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs: data ?? [] });
}

// Self-only: RLS requires user_id = auth.uid() on the write.
export async function PUT(req: NextRequest) {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const rows = parsed.data.prefs.map((p) => ({ user_id: auth.session.userId, event_type: p.event_type, channel: p.channel, enabled: p.enabled, language: parsed.data.language, updated_at: new Date().toISOString() }));
  if (rows.length) {
    const { error } = await auth.supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,event_type,channel" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

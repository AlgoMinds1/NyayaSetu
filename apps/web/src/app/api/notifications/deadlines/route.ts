// Cron target for deadline reminders. Call hourly with header `x-cron-secret: $CRON_SECRET`
// (for example from a Supabase pg_cron http call, Render cron, or an external scheduler).
// Idempotent: the reference is the UTC date, so each case gets at most one reminder per day and channel.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

async function sweep(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const day = new Date().toISOString().slice(0, 10);
  const { data, error } = await db.from("complaints").select("id,deadline_status")
    .in("deadline_status", ["nearing", "overdue"]).not("status", "in", "(closed,out_of_scope,transferred)").limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  for (const row of data ?? []) {
    await notify({ event_type: row.deadline_status === "overdue" ? "deadline_overdue" : "deadline_nearing", complaint_id: row.id, ref: day });
  }
  return NextResponse.json({ processed: data?.length ?? 0, day });
}

export const GET = sweep;
export const POST = sweep;

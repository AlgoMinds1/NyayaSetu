// POST /api/overlap/alerts/[id]/dismiss
// Dismisses an overlap alert: creates dismissed_pairs, updates complaints, closes alert.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
const Schema = z.object({
    reason: z.string().min(1),
    can_reopen: z.boolean().default(true),
});
export async function POST(req, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = req.headers.get("x-user-role") ?? "";
    if (!["pgrc_triage_officer", "bureau_officer", "bureau_head", "system_admin"].includes(role))
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success)
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { data: alert, error: alertErr } = await supabase
        .from("overlap_alerts").select("*").eq("id", id).single();
    if (alertErr || !alert)
        return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    if (alert.status !== "open")
        return NextResponse.json({ error: "Alert is already resolved." }, { status: 409 });
    const { reason, can_reopen } = parsed.data;
    const ids = [...alert.complaint_ids].sort();
    // Create dismissed_pairs for every pair
    const dismissInserts = [];
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            dismissInserts.push({
                complaint_a_id: ids[i],
                complaint_b_id: ids[j],
                dismissed_by: user.id,
                reason,
                can_reopen,
            });
        }
    }
    const { error: dismissErr } = await supabase.from("dismissed_pairs").upsert(dismissInserts, { onConflict: "complaint_a_id,complaint_b_id" });
    if (dismissErr)
        return NextResponse.json({ error: dismissErr.message }, { status: 500 });
    // Update complaints' coordination_status
    await supabase.from("complaints")
        .update({ coordination_status: "dismissed", updated_at: new Date().toISOString() })
        .in("id", alert.complaint_ids)
        .in("coordination_status", ["no_overlap", "possible_overlap"]);
    // Close the alert
    await supabase.from("overlap_alerts")
        .update({ status: "dismissed", reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_reason: reason })
        .eq("id", id);
    return NextResponse.json({ success: true });
}

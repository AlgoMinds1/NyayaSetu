// POST /api/overlap/alerts/[id]/link
// Links the cases in this alert: creates case_links record, updates complaints, closes alert.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
const Schema = z.object({
    lead_bureau: z.string().min(1),
    link_reason: z.string().min(1),
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
    // Fetch the alert
    const { data: alert, error: alertErr } = await supabase
        .from("overlap_alerts").select("*").eq("id", id).single();
    if (alertErr || !alert)
        return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    if (alert.status !== "open")
        return NextResponse.json({ error: "Alert is already resolved." }, { status: 409 });
    const ids = [...alert.complaint_ids].sort();
    if (ids.length < 2)
        return NextResponse.json({ error: "Alert must have at least 2 complaint IDs" }, { status: 400 });
    const { lead_bureau, link_reason } = parsed.data;
    // Create case_links for every pair
    const linkInserts = [];
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            linkInserts.push({
                alert_id: id,
                complaint_a_id: ids[i],
                complaint_b_id: ids[j],
                lead_bureau,
                link_reason,
                linked_by: user.id,
            });
        }
    }
    const { error: linkErr } = await supabase.from("case_links").insert(linkInserts);
    if (linkErr)
        return NextResponse.json({ error: linkErr.message }, { status: 500 });
    // Update all involved complaints' coordination_status
    await supabase.from("complaints")
        .update({ coordination_status: "linked", updated_at: new Date().toISOString() })
        .in("id", alert.complaint_ids);
    // Close the alert
    await supabase.from("overlap_alerts")
        .update({ status: "linked", reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_reason: link_reason })
        .eq("id", id);
    return NextResponse.json({ success: true });
}

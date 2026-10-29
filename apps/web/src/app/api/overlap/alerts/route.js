// GET /api/overlap/alerts — list all overlap alerts with complaint details
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(req) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status") ?? "open";
    const alert_type = searchParams.get("type");
    let query = supabase
        .from("overlap_alerts")
        .select(`
      id, institution_id, alert_type, status, complaint_ids, match_factors, triggered_at,
      institutions(name, aicte_permanent_id, region)
    `)
        .eq("status", status)
        .order("triggered_at", { ascending: false });
    if (alert_type)
        query = query.eq("alert_type", alert_type);
    const { data: alerts, error } = await query;
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    // For each alert, fetch the linked complaint details
    const enriched = await Promise.all((alerts ?? []).map(async (alert) => {
        const { data: cases } = await supabase
            .from("complaints")
            .select("id, case_id, category, status, assigned_bureau, receipt_date")
            .in("id", alert.complaint_ids);
        return { ...alert, cases: cases ?? [] };
    }));
    // Count by type for tabs
    const { count: coordCount } = await supabase
        .from("overlap_alerts").select("id", { count: "exact", head: true })
        .eq("status", "open").eq("alert_type", "coordination");
    const { count: relatedCount } = await supabase
        .from("overlap_alerts").select("id", { count: "exact", head: true })
        .eq("status", "open").eq("alert_type", "related");
    return NextResponse.json({
        data: enriched,
        counts: { coordination: coordCount ?? 0, related: relatedCount ?? 0 },
    });
}

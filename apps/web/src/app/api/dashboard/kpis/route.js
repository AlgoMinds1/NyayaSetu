// API: GET /api/dashboard/kpis
// Returns 7 KPI tile counts for the AICTE dashboard.
// Scope is enforced by RLS; bureau/region injected by middleware.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(req) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Run all counts in parallel — RLS filters by role automatically
    const [total, pending, underProcess, disposed, transferred, beyondTimeline, outOfScope] = await Promise.all([
        supabase.from("complaints").select("id", { count: "exact", head: true }),
        supabase.from("complaints").select("id", { count: "exact", head: true })
            .in("status", ["submitted", "under_triage", "referred", "awaiting_response"]),
        supabase.from("complaints").select("id", { count: "exact", head: true })
            .eq("status", "under_examination"),
        supabase.from("complaints").select("id", { count: "exact", head: true })
            .in("status", ["closed", "appeal_decided"]),
        supabase.from("complaints").select("id", { count: "exact", head: true })
            .eq("status", "transferred"),
        supabase.from("complaints").select("id", { count: "exact", head: true })
            .eq("deadline_status", "overdue"),
        supabase.from("complaints").select("id", { count: "exact", head: true })
            .eq("status", "out_of_scope"),
    ]);
    // Bureau-wise workload + open overlap alerts count (Phase 3)
    const [bureauRes, alertsRes] = await Promise.all([
        supabase
            .from("complaints")
            .select("assigned_bureau")
            .not("assigned_bureau", "is", null)
            .not("status", "in", '("closed","appeal_decided","out_of_scope")'),
        supabase
            .from("overlap_alerts")
            .select("id", { count: "exact", head: true })
            .eq("status", "open"),
    ]);
    const bureauWorkload = {};
    bureauRes.data?.forEach(({ assigned_bureau }) => {
        if (assigned_bureau)
            bureauWorkload[assigned_bureau] = (bureauWorkload[assigned_bureau] ?? 0) + 1;
    });
    return NextResponse.json({
        total: total.count ?? 0,
        pending: pending.count ?? 0,
        underProcess: underProcess.count ?? 0,
        disposed: disposed.count ?? 0,
        transferred: transferred.count ?? 0,
        beyondTimeline: beyondTimeline.count ?? 0,
        outOfScope: outOfScope.count ?? 0,
        openAlerts: alertsRes.count ?? 0,
        bureauWorkload,
    });
}

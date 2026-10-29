// GET /api/institutions/[id] — institution profile + consolidated case history
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(_req, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [institution, cases, alerts] = await Promise.all([
        supabase.from("institutions").select("*").eq("id", id).single(),
        supabase.from("complaints")
            .select("id, case_id, category, status, assigned_bureau, receipt_date, expected_disposal_at, deadline_status, coordination_status, is_demo")
            .eq("institution_id", id)
            .order("receipt_date", { ascending: false }),
        supabase.from("overlap_alerts")
            .select("*")
            .eq("institution_id", id)
            .eq("status", "open")
            .order("triggered_at", { ascending: false }),
    ]);
    if (institution.error || !institution.data)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
        institution: institution.data,
        cases: cases.data ?? [],
        openAlerts: alerts.data ?? [],
    });
}

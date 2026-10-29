import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/api-session";
export async function GET() { const auth = await getApiSession(); if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { session, supabase } = auth; if (session.role !== "college_management" || !session.institutionId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const { data, error } = await supabase.from("complaints").select("id,case_id,category,status,receipt_date,last_action_at,deadline_status,urgency_status").eq("institution_id", session.institutionId).eq("involves_management", false).in("status", ["referred", "awaiting_response", "under_examination"]).order("receipt_date", { ascending: false }); if (error)
    return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ data: data ?? [] }); }

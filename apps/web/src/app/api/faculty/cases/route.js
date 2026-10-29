import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/api-session";
export async function GET() { const auth = await getApiSession(); if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); if (auth.session.role !== "faculty")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const { data: assigned, error: participantError } = await auth.supabase.from("participants").select("complaint_id").eq("user_id", auth.session.userId).eq("role", "faculty").is("removed_at", null); if (participantError)
    return NextResponse.json({ error: participantError.message }, { status: 500 }); const ids = (assigned ?? []).map(x => x.complaint_id); if (!ids.length)
    return NextResponse.json({ data: [] }); const { data, error } = await auth.supabase.from("complaints").select("id,case_id,category,status,receipt_date,last_action_at,deadline_status,urgency_status").in("id", ids).order("receipt_date", { ascending: false }); if (error)
    return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ data: data ?? [] }); }

import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { createAdminClient } from "@/lib/supabase/admin";
const Body = z.object({ request_type: z.enum(["data_export", "rectification", "account_closure"]), details: z.string().trim().max(2000).optional() });
export async function GET() { const auth = await getApiSession(); if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); if (auth.session.role !== "student")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const { data, error } = await createAdminClient().from("privacy_requests").select("id,request_type,details,status,created_at,resolved_at").eq("user_id", auth.session.userId).order("created_at", { ascending: false }); if (error)
    return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ requests: data ?? [] }); }
export async function POST(req) { const auth = await getApiSession(); if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); if (auth.session.role !== "student")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const input = Body.safeParse(await req.json().catch(() => null)); if (!input.success)
    return NextResponse.json({ error: input.error.flatten() }, { status: 400 }); const { data, error } = await createAdminClient().from("privacy_requests").insert({ user_id: auth.session.userId, request_type: input.data.request_type, details: input.data.details ?? null }).select("id,request_type,details,status,created_at").single(); if (error)
    return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ request: data }, { status: 201 }); }

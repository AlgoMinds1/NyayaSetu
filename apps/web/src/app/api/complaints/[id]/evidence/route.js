import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/api-session";
import { createAdminClient } from "@/lib/supabase/admin";
const MAX = 10 * 1024 * 1024;
const TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
export async function POST(req, { params }) { const auth = await getApiSession(); if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params; const admin = createAdminClient(); const { data: c } = await admin.from("complaints").select("id,institution_id,submitted_by,involves_management,status").eq("id", id).maybeSingle(); if (!c)
    return NextResponse.json({ error: "Not found" }, { status: 404 }); const student = auth.session.role === "student" && c.submitted_by === auth.session.userId; const college = auth.session.role === "college_management" && c.institution_id === auth.session.institutionId && !c.involves_management && ["awaiting_response", "under_examination"].includes(c.status); if (!student && !college)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const form = await req.formData(); const item = form.get("file"); if (!(item instanceof File))
    return NextResponse.json({ error: "Select a file." }, { status: 400 }); if (item.size < 1 || item.size > MAX || !TYPES.has(item.type))
    return NextResponse.json({ error: "Use a PDF or PNG, JPEG, or WebP image up to 10 MB." }, { status: 400 }); const bytes = new Uint8Array(await item.arrayBuffer()); const digest = await crypto.subtle.digest("SHA-256", bytes); const hash = Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join(""); const name = `${id}/${crypto.randomUUID()}.${ext(item.type)}`; const { error: uploadError } = await admin.storage.from("case-evidence").upload(name, bytes, { contentType: item.type, upsert: false }); if (uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 }); const { data: evidence, error } = await admin.from("evidence").insert({ complaint_id: id, uploaded_by: auth.session.userId, file_path: name, mime_type: item.type, size_bytes: item.size, hash_sha256: hash }).select("id,file_path,mime_type,size_bytes,uploaded_at").single(); if (error || !evidence) {
    await admin.storage.from("case-evidence").remove([name]);
    return NextResponse.json({ error: error?.message ?? "Could not save evidence record." }, { status: 500 });
} return NextResponse.json({ evidence }, { status: 201 }); }
function ext(type) { return type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp"; }

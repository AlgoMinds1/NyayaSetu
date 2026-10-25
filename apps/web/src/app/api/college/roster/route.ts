import { NextResponse, type NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/api-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
import { reverifyAffiliations } from "@/lib/affiliations/roster";

const LIMIT = 5 * 1024 * 1024;
const MAX_ROWS = 10_000;

export async function GET() {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (auth.session.role !== "college_management" || !auth.session.institutionId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await auth.supabase.from("roster_versions")
    .select("id,uploaded_at,row_count,version_label,is_active")
    .eq("institution_id", auth.session.institutionId).order("uploaded_at", { ascending: false }).limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ versions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (auth.session.role !== "college_management" || !auth.session.institutionId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > LIMIT || !file.name.toLowerCase().endsWith(".csv")) return NextResponse.json({ error: "Upload a CSV file up to 5 MB." }, { status: 400 });
  const text = (await file.text()).replace(/^\uFEFF/, "");
  let parsed: string[][];
  try { parsed = parseCsv(text); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid CSV." }, { status: 400 }); }
  if (!parsed.length) return NextResponse.json({ error: "CSV has no data rows." }, { status: 400 });
  if (parsed.length > MAX_ROWS + 1) return NextResponse.json({ error: `CSV cannot exceed ${MAX_ROWS} rows.` }, { status: 400 });
  const header = parsed.shift()!.map((x) => x.trim().toLowerCase());
  const idx = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const enrollment = idx("enrollment_no", "enrollment", "roll_no", "roll number");
  const nameIdx = idx("name", "student_name");
  const programme = idx("programme", "program", "course");
  const year = idx("year", "academic_year");
  if (enrollment < 0 || nameIdx < 0) return NextResponse.json({ error: "CSV must include enrollment_no and name columns." }, { status: 400 });
  const seen = new Set<string>();
  const rows: { enrollment_no: string; name: string; programme: string | null; year: string | null }[] = [];
  for (const [n, row] of parsed.entries()) {
    const en = (row[enrollment] ?? "").trim(), nm = (row[nameIdx] ?? "").trim();
    if (!en || !nm) return NextResponse.json({ error: `Row ${n + 2} needs enrollment number and name.` }, { status: 400 });
    if (seen.has(en.toLowerCase())) return NextResponse.json({ error: `Duplicate enrollment number on row ${n + 2}.` }, { status: 400 });
    seen.add(en.toLowerCase());
    rows.push({ enrollment_no: en, name: nm, programme: programme < 0 ? null : (row[programme] ?? "").trim() || null, year: year < 0 ? null : (row[year] ?? "").trim() || null });
  }

  const admin = createAdminClient(), institutionId = auth.session.institutionId;
  const versionId = crypto.randomUUID(), path = `${institutionId}/${versionId}.csv`;
  const { error: uploadError } = await admin.storage.from("institution-rosters").upload(path, new TextEncoder().encode(text), { contentType: "text/csv", upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  const { error: versionError } = await admin.from("roster_versions").insert({ id: versionId, institution_id: institutionId, uploaded_by: auth.session.userId, row_count: rows.length, file_path: path, version_label: `Roster ${new Date().toLocaleDateString("en-CA")}`, is_active: false });
  if (versionError) { await admin.storage.from("institution-rosters").remove([path]); return NextResponse.json({ error: versionError.message }, { status: 500 }); }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("roster_rows").insert(rows.slice(i, i + 500).map((row) => ({ ...row, version_id: versionId })));
    if (error) {
      await admin.from("roster_rows").delete().eq("version_id", versionId);
      await admin.from("roster_versions").delete().eq("id", versionId);
      await admin.storage.from("institution-rosters").remove([path]);
      return NextResponse.json({ error: `Roster rows could not be saved: ${error.message}` }, { status: 500 });
    }
  }
  const { error: deactivateError } = await admin.from("roster_versions").update({ is_active: false }).eq("institution_id", institutionId).eq("is_active", true);
  if (deactivateError) return NextResponse.json({ error: deactivateError.message }, { status: 500 });
  const { error: activateError } = await admin.from("roster_versions").update({ is_active: true }).eq("id", versionId);
  if (activateError) return NextResponse.json({ error: activateError.message }, { status: 500 });
  try {
    const reverified = await reverifyAffiliations(admin, institutionId);
    await auditLog({ actor_id: auth.session.userId, action: "college.roster_uploaded", resource_type: "roster_version", resource_id: versionId, new_value: { institution_id: institutionId, row_count: rows.length, reverified } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Roster re-verification failed." }, { status: 500 }); }
  return NextResponse.json({ version: { id: versionId, row_count: rows.length, is_active: true } }, { status: 201 });
}

function parseCsv(input: string) {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) { if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"' && cell.length === 0) quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); if (row.some((v) => v.trim())) rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(cell.replace(/\r$/, "")); if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

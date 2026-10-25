// GET /api/reports/[type]?from&to&bureau&region&institution[&format=csv|xlsx|pdf]
// Without format: JSON report for the on-screen view. With format: file download, recorded in report_runs + audit.

import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/api-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
import { FORMATS, toCsv, toPdf, toXlsx, type ExportFormat } from "@/lib/reports/export";
import { REPORT_TYPES, ReportForbiddenError, runReport, scopeFor, type ReportFilters, type ReportType } from "@/lib/reports/queries";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const CONTENT_TYPE: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

function parseFilters(params: URLSearchParams): ReportFilters | null {
  const filters: ReportFilters = {};
  const from = params.get("from"), to = params.get("to"), institution = params.get("institution");
  if (from) { if (!DATE.test(from)) return null; filters.from = from; }
  if (to) { if (!DATE.test(to)) return null; filters.to = to; }
  if (institution) { if (!UUID.test(institution)) return null; filters.institutionId = institution; }
  const bureau = params.get("bureau"), region = params.get("region");
  if (bureau) filters.bureau = bureau.slice(0, 40);
  if (region) filters.region = region.slice(0, 40);
  return filters;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!(REPORT_TYPES as readonly string[]).includes(type)) return NextResponse.json({ error: "Unknown report" }, { status: 404 });

  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { supabase, session } = auth;

  const filters = parseFilters(req.nextUrl.searchParams);
  if (!filters) return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  const formatParam = req.nextUrl.searchParams.get("format");
  if (formatParam && !(FORMATS as readonly string[]).includes(formatParam)) return NextResponse.json({ error: "Invalid format" }, { status: 400 });

  let scope;
  try { scope = scopeFor(session); }
  catch (err) { if (err instanceof ReportForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); throw err; }

  const report = await runReport(supabase, type as ReportType, filters, scope);
  if (!formatParam) return NextResponse.json(report);

  const format = formatParam as ExportFormat;
  const db = createAdminClient();
  const { data: run, error: runError } = await db.from("report_runs").insert({
    report_type: type, requested_by: session.userId, params: { ...report.filters, format },
    status: "completed", generated_at: new Date().toISOString(),
  }).select("id").single();
  if (runError) return NextResponse.json({ error: "Could not record report run" }, { status: 500 });
  await auditLog({ actor_id: session.userId, action: "report.export", resource_type: "report_run", resource_id: run.id,
    new_value: { report_type: type, format, filters: report.filters } });

  const filename = `nyayasetu-${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
  const body = format === "csv" ? toCsv(report) : format === "xlsx" ? await toXlsx(report) : await toPdf(report);
  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
    headers: { "Content-Type": CONTENT_TYPE[format], "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}

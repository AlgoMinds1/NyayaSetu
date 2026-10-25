// Cron target for the monthly report. The pg_cron job queues report_runs (status 'queued') for bureau heads;
// this route generates each queued run in the requester's scope and emails a text summary through Resend.
// Auth: x-cron-secret header must equal CRON_SECRET. Listed in proxy.ts OPEN routes; the header is checked here.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/notify";
import { REPORT_FOOTER, REPORT_TYPES, ReportForbiddenError, runReport, scopeFor, type ReportType } from "@/lib/reports/queries";
import type { AppSession } from "@/lib/auth/session";
import { ROLES, type Role } from "@/lib/auth/roles";

async function sweep(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data: queued, error } = await db.from("report_runs").select("id,report_type,requested_by")
    .eq("status", "queued").order("created_at").limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let completed = 0, failed = 0;
  for (const run of queued ?? []) {
    try {
      const { data: assignment } = await db.from("role_assignments").select("role,bureau,region,institution_id")
        .eq("user_id", run.requested_by).is("revoked_at", null).maybeSingle();
      if (!assignment || !ROLES.includes(assignment.role as Role)) throw new ReportForbiddenError("Requester has no active role");
      const session: AppSession = { userId: run.requested_by, role: assignment.role as Role, institutionId: assignment.institution_id,
        bureau: assignment.bureau, region: assignment.region, aal: null };
      const report = await runReport(db, run.report_type as ReportType, {}, scopeFor(session));

      await db.from("report_runs").update({ status: "completed", generated_at: new Date().toISOString() }).eq("id", run.id);
      const { data: user } = await db.from("users").select("email").eq("id", run.requested_by).maybeSingle();
      if (user?.email && process.env.RESEND_API_KEY) {
        const lines = report.rows.slice(0, 25).map((row) => row.join(" | "));
        await sendEmail(user.email, `NyayaSetu monthly report: ${report.title}`,
          [report.summary, "", report.columns.join(" | "), ...lines, "", REPORT_FOOTER].join("\n"));
      }
      completed++;
    } catch (err) {
      failed++;
      await db.from("report_runs").update({ status: "failed" }).eq("id", run.id);
      if (!(err instanceof ReportForbiddenError)) console.error("Scheduled report failed", run.id, err);
    }
  }
  return NextResponse.json({ processed: queued?.length ?? 0, completed, failed, reportTypes: REPORT_TYPES.length });
}

export const GET = sweep;
export const POST = sweep;

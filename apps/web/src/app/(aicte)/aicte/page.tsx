import { createClient } from "@/lib/supabase/server";
import { getAppSession } from "@/lib/auth/session";
import KpiDashboard from "@/components/aicte/kpi-dashboard";
import Link from "next/link";
import { NotificationBell } from "@/components/notifications/bell";

export const metadata = { title: "AICTE Dashboard — NyayaSetu" };
export const revalidate = 30; // ISR: revalidate every 30s

export default async function AicteHome() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = user ? await getAppSession(user) : null;
  if (!session) return null;

  const ROLE_LABELS: Record<string, string> = {
    pgrc_triage_officer: "PGRC Triage Officer",
    bureau_officer:      "Bureau Officer",
    bureau_head:         "Bureau Head / Adviser",
    regional_officer:    "Regional Officer",
    competent_authority: "Competent Authority",
    ombudsperson:        "Ombudsperson",
    auditor:             "Auditor",
    system_admin:        "System Administrator",
  };

  const canCreateCase = ["pgrc_triage_officer"].includes(session.role);

  // Fetch open overlap alert count for the badge
  const { count: openAlerts } = await supabase
    .from("overlap_alerts")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-800 text-lg">NyayaSetu</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600 text-sm">AICTE Operations Portal</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">{ROLE_LABELS[session.role] ?? session.role}</span>
          {session.bureau && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">{session.bureau}</span>}
          <a href="/auth/new-device" className="text-slate-400 hover:text-slate-600 text-xs">Devices</a>
          <form action="/api/auth/signout" method="POST">
            <button className="text-slate-400 hover:text-red-500 text-xs">Sign out</button>
          </form>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">Real-time overview of all institution complaint cases</p>
          </div>
          <div className="flex gap-2 items-center">
            <NotificationBell />
            {["system_admin", "auditor"].includes(session.role) && (
              <Link href="/aicte/admin/roles"
                className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                Roles
              </Link>
            )}
            {session.role === "system_admin" && (
              <Link href="/aicte/admin/deadline-rules"
                className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                Deadline rules
              </Link>
            )}
            <Link href="/aicte/reports"
              className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Reports
            </Link>
            <Link href="/aicte/assistant"
              className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Policy assistant
            </Link>
            {canCreateCase && (
              <Link href="/aicte/cases/new"
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                + New Case
              </Link>
            )}
            <Link href="/aicte/cases"
              className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              All Cases
            </Link>
          </div>
        </div>

        {/* KPI tiles + Bureau workload chart */}
        <KpiDashboard />

        {/* Quick nav cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/aicte/cases?deadline_status=overdue" className="block rounded-lg border border-red-200 bg-red-50 p-4 hover:bg-red-100 transition-colors">
            <div className="text-red-700 font-semibold text-sm">⚠ Overdue Cases</div>
            <div className="text-red-500 text-xs mt-1">Cases beyond prescribed timelines requiring immediate action</div>
          </Link>
          <Link href="/aicte/alerts" className="block rounded-lg border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-amber-700 font-semibold text-sm">🔗 Overlap Alerts</span>
              {(openAlerts ?? 0) > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{openAlerts}</span>
              )}
            </div>
            <div className="text-amber-500 text-xs mt-1">Cases where multiple Bureaus are handling the same institution</div>
          </Link>
          <Link href="/aicte/cases/new" className="block rounded-lg border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100 transition-colors">
            <div className="text-blue-700 font-semibold text-sm">+ Intake New Case</div>
            <div className="text-blue-500 text-xs mt-1">Register a new complaint received via PGRC, RB or walk-in</div>
          </Link>
        </div>

        <div className="text-xs text-slate-400 border-t border-slate-200 pt-4">
          NyayaSetu · Demo build · All seed data is synthetic and labelled DEMO · Deadlines shown are configurable defaults, not official AICTE rules.
        </div>
      </main>
    </div>
  );
}

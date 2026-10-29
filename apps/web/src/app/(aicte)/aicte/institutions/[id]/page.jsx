// /aicte/institutions/[id] — Institution profile with consolidated case history
import { createClient } from "@/lib/supabase/server";
import { getAppSession } from "@/lib/auth/session";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/state-machine";
import Link from "next/link";
import { notFound } from "next/navigation";
export const metadata = { title: "Institution Profile — NyayaSetu" };
export default async function InstitutionPage({ params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const session = user ? await getAppSession(user) : null;
    if (!session)
        return null;
    const [instRes, casesRes, alertsRes] = await Promise.all([
        supabase.from("institutions").select("*").eq("id", id).single(),
        supabase.from("complaints")
            .select("id,case_id,category,status,assigned_bureau,receipt_date,expected_disposal_at,deadline_status,coordination_status,is_demo")
            .eq("institution_id", id)
            .order("receipt_date", { ascending: false }),
        supabase.from("overlap_alerts")
            .select("*").eq("institution_id", id).eq("status", "open"),
    ]);
    if (instRes.error || !instRes.data)
        notFound();
    const inst = instRes.data;
    const cases = casesRes.data ?? [];
    const alerts = alertsRes.data ?? [];
    const bureauBreakdown = {};
    cases.forEach(c => {
        if (c.assigned_bureau)
            bureauBreakdown[c.assigned_bureau] = (bureauBreakdown[c.assigned_bureau] ?? 0) + 1;
    });
    return (<div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
        <Link href="/aicte/cases" className="text-slate-400 hover:text-slate-700 text-sm">← Cases</Link>
        <span className="text-slate-300">|</span>
        <span className="text-slate-700 font-medium text-sm">Institution Profile</span>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Profile card */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800">{inst.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                <span className="font-mono">{inst.aicte_permanent_id}</span>
                <span>·</span>
                <span>{inst.region}</span>
                <span>·</span>
                <span className="capitalize">{inst.type}</span>
              </div>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${inst.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {inst.status}
            </span>
          </div>

          {/* Bureau breakdown */}
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(bureauBreakdown).map(([bureau, count]) => (<span key={bureau} className="bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full border border-blue-100">
                {bureau}: {count} open case{count !== 1 ? "s" : ""}
              </span>))}
            {cases.length === 0 && <span className="text-slate-400 text-sm">No complaint cases on record.</span>}
          </div>
        </div>

        {/* Overlap alerts */}
        {alerts.length > 0 && (<div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-red-700">⚠ Potential Overlapping Cases – Coordination Required</h2>
            {alerts.map(a => (<div key={a.id} className="text-xs text-red-600 bg-white rounded border border-red-100 px-3 py-2">
                <span className="font-semibold capitalize">{a.alert_type === "coordination" ? "Cross-Bureau Coordination Required" : "Potential Related Cases"}</span>
                {a.match_factors?.match_strength && (<span className="ml-2 text-amber-600">Match strength: {Math.round(Number(a.match_factors.match_strength) * 100)}%</span>)}
                <div className="text-slate-400 mt-0.5">Triggered: {new Date(a.triggered_at).toLocaleDateString()}</div>
              </div>))}
          </div>)}

        {/* Consolidated case history */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Consolidated Case History ({cases.length})</h2>
            <span className="text-xs text-slate-400">All Bureaus · All time</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Case ID", "Category", "Status", "Bureau", "Receipt", "Disposal", "Deadline"].map(h => (<th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-500">{h}</th>))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cases.map(c => (<tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/aicte/cases/${c.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                      {c.case_id}
                    </Link>
                    {c.is_demo && <span className="ml-1 text-[10px] bg-yellow-100 text-yellow-700 px-1 rounded">DEMO</span>}
                  </td>
                  <td className="px-4 py-2 capitalize text-slate-600 text-xs">{c.category}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500 text-xs">{c.assigned_bureau ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-400 text-xs">{c.receipt_date}</td>
                  <td className="px-4 py-2 text-slate-400 text-xs">{c.expected_disposal_at?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">
                    {c.deadline_status === "overdue" && <span className="text-red-600 font-semibold">⚠ Overdue</span>}
                    {c.deadline_status === "nearing" && <span className="text-amber-600">⏰ Nearing</span>}
                    {c.deadline_status === "on_track" && <span className="text-green-600">On track</span>}
                  </td>
                </tr>))}
            </tbody>
          </table>
          {cases.length === 0 && (<div className="px-5 py-8 text-center text-slate-400 text-sm">No complaint cases for this institution.</div>)}
        </div>
      </main>
    </div>);
}

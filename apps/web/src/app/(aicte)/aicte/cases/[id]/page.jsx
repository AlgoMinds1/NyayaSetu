// /aicte/cases/[id] — Case detail page (server component)
import { createClient } from "@/lib/supabase/server";
import { getAppSession } from "@/lib/auth/session";
import { STATUS_LABELS, STATUS_COLORS, validNextStates } from "@/lib/state-machine";
import Link from "next/link";
import { notFound } from "next/navigation";
import CaseActions from "@/components/aicte/case-actions";
import EventHistory from "@/components/aicte/event-history";
export const metadata = { title: "Case Detail — NyayaSetu" };
const TRACK_LABELS = {
    verification_status: { pending: "Pending", verified: "Verified", needs_review: "Needs Review", unable_to_verify: "Unable to Verify" },
    coordination_status: { no_overlap: "No Overlap", possible_overlap: "Possible Overlap ⚠", linked: "Linked", dismissed: "Dismissed" },
    deadline_status: { on_track: "On Track", nearing: "Nearing ⏰", overdue: "Overdue ⚠", paused: "Paused" },
    appeal_status: { not_applicable: "N/A", eligible: "Eligible", submitted: "Submitted", under_review: "Under Review", decided: "Decided" },
    urgency_status: { untriaged: "Untriaged", triaged: "Triaged", urgent: "URGENT 🚨", out_of_scope: "Out of Scope" },
};
const TRACK_COLORS = {
    verification_status: { pending: "bg-slate-100 text-slate-600", verified: "bg-green-100 text-green-700", needs_review: "bg-amber-100 text-amber-700", unable_to_verify: "bg-red-100 text-red-700" },
    coordination_status: { no_overlap: "bg-slate-100 text-slate-500", possible_overlap: "bg-red-100 text-red-700", linked: "bg-blue-100 text-blue-700", dismissed: "bg-slate-100 text-slate-400" },
    deadline_status: { on_track: "bg-green-100 text-green-700", nearing: "bg-amber-100 text-amber-700", overdue: "bg-red-100 text-red-700 font-semibold", paused: "bg-slate-100 text-slate-500" },
    appeal_status: { not_applicable: "bg-slate-100 text-slate-400", eligible: "bg-blue-100 text-blue-700", submitted: "bg-purple-100 text-purple-700", under_review: "bg-amber-100 text-amber-700", decided: "bg-green-100 text-green-700" },
    urgency_status: { untriaged: "bg-slate-100 text-slate-500", triaged: "bg-blue-100 text-blue-700", urgent: "bg-red-200 text-red-800 font-bold animate-pulse", out_of_scope: "bg-slate-100 text-slate-400" },
};
export default async function CaseDetailPage({ params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const session = user ? await getAppSession(user) : null;
    if (!session)
        return null;
    const { data: c, error } = await supabase
        .from("complaints")
        .select(`*, institutions(id,name,aicte_permanent_id,region,type), users!submitted_by(display_name), users!assigned_officer(display_name)`)
        .eq("id", id)
        .single();
    if (error || !c)
        notFound();
    const { data: events } = await supabase
        .from("case_events")
        .select(`*, users!actor_id(display_name)`)
        .eq("complaint_id", id)
        .order("event_at", { ascending: true });
    const nextStates = validNextStates(c.status);
    const canAct = ["pgrc_triage_officer", "bureau_officer", "bureau_head", "ombudsperson"].includes(session.role);
    const tracks = [
        { key: "verification_status", label: "Verification" },
        { key: "coordination_status", label: "Coordination" },
        { key: "deadline_status", label: "Deadline" },
        { key: "appeal_status", label: "Appeal" },
        { key: "urgency_status", label: "Urgency" },
    ];
    return (<div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
        <Link href="/aicte/cases" className="text-slate-400 hover:text-slate-700 text-sm">← Cases</Link>
        <span className="text-slate-300">|</span>
        <span className="font-mono text-blue-700 text-sm">{c.case_id}</span>
        {c.is_demo && <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded">DEMO</span>}
        {c.is_confidential && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded">🔒 Confidential</span>}
        {c.involves_management && <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded">⚠ Involves Management</span>}
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Status tracks */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${STATUS_COLORS[c.status]}`}>
              {STATUS_LABELS[c.status]}
            </span>
            <span className="text-slate-400 text-xs">Lifecycle status</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {tracks.map(({ key, label }) => {
            const val = c[key];
            const color = TRACK_COLORS[key]?.[val] ?? "bg-slate-100 text-slate-500";
            const text = TRACK_LABELS[key]?.[val] ?? val;
            return (<div key={key} className="flex items-center gap-1">
                  <span className="text-xs text-slate-400">{label}:</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${color}`}>{text}</span>
                </div>);
        })}
          </div>
        </div>

        {/* Overlap panel — shown when coordination_status is not no_overlap */}
        {c.coordination_status !== "no_overlap" && (<div className={`rounded-lg border px-4 py-3 flex items-center justify-between text-sm
            ${c.coordination_status === "possible_overlap" ? "border-red-200 bg-red-50" : ""}
            ${c.coordination_status === "linked" ? "border-blue-200 bg-blue-50" : ""}
            ${c.coordination_status === "dismissed" ? "border-slate-200 bg-slate-50" : ""}
          `}>
            <span className={c.coordination_status === "possible_overlap" ? "text-red-700 font-medium" :
                c.coordination_status === "linked" ? "text-blue-700 font-medium" :
                    "text-slate-500"}>
              {c.coordination_status === "possible_overlap" && "⚠ Potential overlap detected — this institution has active cases in multiple Bureaus"}
              {c.coordination_status === "linked" && "🔗 This case has been linked to one or more related cases by an officer"}
              {c.coordination_status === "dismissed" && "✓ Overlap alert was reviewed and dismissed"}
            </span>
            {c.coordination_status !== "dismissed" && (<Link href="/aicte/alerts" className="ml-4 text-xs font-medium underline whitespace-nowrap
                  text-red-600 hover:text-red-800">
                View Alert Centre →
              </Link>)}
          </div>)}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Case details */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
              <h2 className="font-semibold text-slate-800">Case Details</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><dt className="text-slate-400 text-xs">Institution</dt><dd className="font-medium text-slate-800">{c.institutions?.name}</dd></div>
                <div><dt className="text-slate-400 text-xs">AICTE ID</dt><dd className="font-mono text-slate-600">{c.institutions?.aicte_permanent_id}</dd></div>
                <div><dt className="text-slate-400 text-xs">Region</dt><dd className="text-slate-600">{c.institutions?.region}</dd></div>
                <div><dt className="text-slate-400 text-xs">Category</dt><dd className="capitalize text-slate-600">{c.category}</dd></div>
                <div><dt className="text-slate-400 text-xs">Submitted by</dt><dd className="text-slate-600">{c.users?.display_name ?? "—"}</dd></div>
                <div><dt className="text-slate-400 text-xs">Receipt date</dt><dd className="text-slate-600">{c.receipt_date}</dd></div>
                <div><dt className="text-slate-400 text-xs">Assigned Bureau</dt><dd className="text-slate-600">{c.assigned_bureau ?? "—"}</dd></div>
                <div><dt className="text-slate-400 text-xs">Assigned Officer</dt><dd className="text-slate-600">{c.users?.display_name ?? "Unassigned"}</dd></div>
                <div><dt className="text-slate-400 text-xs">Last action</dt><dd className="text-slate-600">{c.last_action_at ? new Date(c.last_action_at).toLocaleDateString() : "—"}</dd></div>
                <div><dt className="text-slate-400 text-xs">Expected disposal</dt><dd className={`${c.deadline_status === "overdue" ? "text-red-600 font-semibold" : "text-slate-600"}`}>{c.expected_disposal_at?.slice(0, 10) ?? "—"}</dd></div>
                {c.next_action && <div className="col-span-2"><dt className="text-slate-400 text-xs">Next action required</dt><dd className="text-slate-700">{c.next_action}</dd></div>}
              </dl>
              <div>
                <div className="text-slate-400 text-xs mb-1">Description</div>
                <p className="text-slate-700 text-sm leading-relaxed bg-slate-50 rounded p-3 border border-slate-100">{c.description_text}</p>
              </div>
            </div>

            {/* Institution link */}
            <Link href={`/aicte/institutions/${c.institution_id}`} className="block rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors text-sm text-blue-600">
              → View institution profile for {c.institutions?.name}
            </Link>
          </div>

          {/* Right: Actions + History */}
          <div className="space-y-4">
            {canAct && (<CaseActions complaintId={c.id} currentStatus={c.status} currentVersion={c.version} nextStates={nextStates} role={session.role}/>)}
            <EventHistory events={events ?? []}/>
          </div>
        </div>
      </main>
    </div>);
}

"use client";
const EVENT_LABELS = {
    case_submitted: "Case submitted",
    status_transition: "Status changed",
    assignment: "Assignment updated",
    officer_action: "Action recorded",
    overlap_linked: "Cases linked",
    overlap_dismissed: "Overlap dismissed",
};
export default function EventHistory({ events }) {
    if (!events.length)
        return (<div className="bg-white rounded-lg border border-slate-200 p-4 text-sm text-slate-400">No events yet.</div>);
    return (<div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Action History</h3>
      <ol className="relative border-l border-slate-200 ml-2 space-y-4">
        {events.map(ev => (<li key={ev.id} className="ml-4">
            <span className="absolute -left-1.5 w-3 h-3 bg-slate-300 rounded-full border-2 border-white"/>
            <div className="text-xs text-slate-500">{new Date(ev.event_at).toLocaleString()}</div>
            <div className="text-sm font-medium text-slate-800">
              {EVENT_LABELS[ev.event_type] ?? ev.event_type}
            </div>
            <div className="text-xs text-slate-500">
              {ev.users?.display_name ?? "System"} · {ev.actor_role}
              {ev.bureau && ` · ${ev.bureau}`}
            </div>
            {typeof ev.old_state?.status === "string" && typeof ev.new_state?.status === "string" && (<div className="text-xs text-slate-400 mt-0.5">
                {ev.old_state.status} → {ev.new_state.status}
              </div>)}
            {ev.remarks && (<p className="text-xs text-slate-600 mt-1 bg-slate-50 rounded px-2 py-1 border border-slate-100">{ev.remarks}</p>)}
            <div className="text-[10px] text-slate-300 mt-1 font-mono truncate" title={ev.event_hash}>
              #{ev.event_hash?.slice(0, 16)}…
            </div>
          </li>))}
      </ol>
    </div>);
}

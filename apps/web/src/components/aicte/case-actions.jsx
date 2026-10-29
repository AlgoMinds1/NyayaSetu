"use client";
// Case actions panel — transition, assign, append action event.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABELS } from "@/lib/state-machine";
export default function CaseActions({ complaintId, currentVersion, nextStates }) {
    const router = useRouter();
    const [mode, setMode] = useState("idle");
    const [toStatus, setToStatus] = useState("");
    const [remarks, setRemarks] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    async function doTransition() {
        if (!toStatus || !remarks.trim()) {
            setError("Select a status and enter remarks.");
            return;
        }
        setLoading(true);
        setError("");
        const res = await fetch(`/api/complaints/${complaintId}/transition`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to_status: toStatus, remarks, version: currentVersion }),
        });
        const data = await res.json();
        setLoading(false);
        if (!res.ok) {
            setError(data.error ?? "Failed");
            return;
        }
        router.refresh();
        setMode("idle");
        setRemarks("");
        setToStatus("");
    }
    async function doAction() {
        if (!remarks.trim()) {
            setError("Remarks are required.");
            return;
        }
        setLoading(true);
        setError("");
        const res = await fetch(`/api/complaints/${complaintId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event_type: "officer_action", remarks }),
        });
        setLoading(false);
        if (!res.ok) {
            const d = await res.json();
            setError(d.error ?? "Failed");
            return;
        }
        router.refresh();
        setMode("idle");
        setRemarks("");
    }
    if (nextStates.length === 0 && mode === "idle")
        return null;
    return (<div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Actions</h3>

      {mode === "idle" && (<div className="flex flex-col gap-2">
          {nextStates.length > 0 && (<button onClick={() => setMode("transition")} className="w-full text-left text-sm bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded hover:bg-blue-100 transition-colors">
              → Change Status
            </button>)}
          <button onClick={() => setMode("action")} className="w-full text-left text-sm bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded hover:bg-slate-100 transition-colors">
            + Record Action
          </button>
        </div>)}

      {mode === "transition" && (<div className="space-y-3">
          <select className="w-full input" value={toStatus} onChange={e => setToStatus(e.target.value)}>
            <option value="">Select new status…</option>
            {nextStates.map(s => (<option key={s} value={s}>{STATUS_LABELS[s]}</option>))}
          </select>
          <textarea className="w-full input resize-none" rows={3} placeholder="Remarks (required)" value={remarks} onChange={e => setRemarks(e.target.value)}/>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={doTransition} disabled={loading} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {loading ? "Saving…" : "Confirm Transition"}
            </button>
            <button onClick={() => { setMode("idle"); setError(""); }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>)}

      {mode === "action" && (<div className="space-y-3">
          <textarea className="w-full input resize-none" rows={3} placeholder="Describe the action taken (required)" value={remarks} onChange={e => setRemarks(e.target.value)}/>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={doAction} disabled={loading} className="flex-1 bg-slate-700 text-white text-sm font-medium py-2 rounded hover:bg-slate-800 disabled:opacity-50 transition-colors">
              {loading ? "Saving…" : "Record Action"}
            </button>
            <button onClick={() => { setMode("idle"); setError(""); }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>)}
    </div>);
}

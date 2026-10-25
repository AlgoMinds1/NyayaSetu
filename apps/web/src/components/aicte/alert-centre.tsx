"use client";
// Overlap Alert Centre — tabbed view of coordination and related case alerts.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { STATUS_LABELS, STATUS_COLORS, type LifecycleStatus } from "@/lib/state-machine";

type Complaint = { id: string; case_id: string; category: string; status: string; assigned_bureau: string | null; receipt_date: string };
type Alert = {
  id: string; institution_id: string; alert_type: string; status: string;
  complaint_ids: string[]; match_factors: Record<string, unknown>;
  triggered_at: string; cases: Complaint[];
  institutions: { name: string; aicte_permanent_id: string; region: string } | null;
};

type ActionModal = { alertId: string; action: "link" | "dismiss" } | null;

export default function AlertCentre() {
  const [alerts, setAlerts]       = useState<Alert[]>([]);
  const [counts, setCounts]       = useState({ coordination: 0, related: 0 });
  const [tab, setTab]             = useState<"coordination" | "related">("coordination");
  const [loading, setLoading]     = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [modal, setModal]         = useState<ActionModal>(null);
  const [modalForm, setModalForm] = useState({ lead_bureau: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/overlap/alerts?type=${tab}`)
      .then(r => r.json())
      .then(d => { setAlerts(d.data ?? []); setCounts(d.counts ?? { coordination: 0, related: 0 }); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tab]);

  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);

  async function runDetection() {
    setDetecting(true);
    await fetch("/api/overlap/detect", { method: "POST" });
    setDetecting(false);
    load();
  }

  async function submitAction() {
    if (!modal) return;
    setSubmitting(true); setError("");
    const body = modal.action === "link"
      ? { lead_bureau: modalForm.lead_bureau, link_reason: modalForm.reason }
      : { reason: modalForm.reason, can_reopen: true };

    const res = await fetch(`/api/overlap/alerts/${modal.alertId}/${modal.action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(d.error ?? "Failed"); return; }
    setModal(null); setModalForm({ lead_bureau: "", reason: "" });
    load();
  }

  const filtered = alerts.filter(a => a.alert_type === tab);

  return (
    <div className="space-y-4">
      {/* Tab bar + Detect button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setTab("coordination")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "coordination" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
          >
            Cross-Bureau
            {counts.coordination > 0 && <span className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{counts.coordination}</span>}
          </button>
          <button
            onClick={() => setTab("related")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "related" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
          >
            Potentially Related
            {counts.related > 0 && <span className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{counts.related}</span>}
          </button>
        </div>
        <button
          onClick={runDetection}
          disabled={detecting}
          className="text-sm bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {detecting ? "Scanning…" : "↻ Run Detection"}
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-400">
        {tab === "coordination"
          ? "These institutions currently have active cases in multiple Bureaus simultaneously. Coordinate to avoid duplication."
          : "These case pairs share institution, category, or description similarity above the detection threshold."}
      </p>

      {/* Alert cards */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          No open {tab === "coordination" ? "cross-bureau coordination" : "related case"} alerts.
          <br /><button onClick={runDetection} className="mt-2 text-blue-500 hover:underline text-xs">Run detection to scan for new overlaps →</button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(alert => (
            <div key={alert.id} className={`bg-white rounded-lg border p-5 space-y-4 ${tab === "coordination" ? "border-red-200" : "border-amber-200"}`}>
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tab === "coordination" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {tab === "coordination" ? "⚠ Cross-Bureau Coordination" : "🔍 Potentially Related Cases"}
                    </span>
                    {tab === "related" && typeof alert.match_factors?.match_strength === "number" && (
                      <span className="text-xs text-slate-500">
                        Match strength: <strong className="text-amber-700">{Math.round(alert.match_factors.match_strength * 100)}%</strong>
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-semibold text-slate-800">
                    <Link href={`/aicte/institutions/${alert.institution_id}`} className="hover:underline">
                      {alert.institutions?.name ?? alert.institution_id}
                    </Link>
                    <span className="ml-2 text-xs text-slate-400 font-mono">{alert.institutions?.aicte_permanent_id}</span>
                  </div>
                  <div className="text-xs text-slate-400">{alert.institutions?.region} · Triggered {new Date(alert.triggered_at).toLocaleDateString()}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setModal({ alertId: alert.id, action: "link" }); setModalForm({ lead_bureau: "", reason: "" }); }}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    🔗 Link Cases
                  </button>
                  <button
                    onClick={() => { setModal({ alertId: alert.id, action: "dismiss" }); setModalForm({ lead_bureau: "", reason: "" }); }}
                    className="text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ✕ Dismiss
                  </button>
                  <Link href={`/aicte/institutions/${alert.institution_id}`}
                    className="text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg transition-colors">
                    Institution →
                  </Link>
                  {tab === "related" && alert.complaint_ids.length === 2 && (
                    <Link href={`/aicte/alerts/compare?a=${alert.complaint_ids[0]}&b=${alert.complaint_ids[1]}`}
                      className="text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg transition-colors">
                      Compare →
                    </Link>
                  )}
                </div>
              </div>

              {/* Involved cases */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Involved Cases</div>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                  {alert.cases.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                      <Link href={`/aicte/cases/${c.id}`} className="font-mono text-xs text-blue-600 hover:underline">{c.case_id}</Link>
                      <span className="text-xs capitalize text-slate-500">{c.category}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status as LifecycleStatus] ?? "bg-slate-100 text-slate-500"}`}>
                        {STATUS_LABELS[c.status as LifecycleStatus] ?? c.status}
                      </span>
                      <span className="text-xs text-slate-400">{c.assigned_bureau ?? "—"}</span>
                      <span className="text-xs text-slate-400">{c.receipt_date}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Match factors (Alert 2 only) */}
              {tab === "related" && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {alert.match_factors?.same_category === true && <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Same category</span>}
                  {typeof alert.match_factors?.date_proximity === "number" && (
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      Date proximity: {Math.round(alert.match_factors.date_proximity * 100)}%
                      {typeof alert.match_factors?.days_apart === "number" && ` (${alert.match_factors.days_apart}d apart)`}
                    </span>
                  )}
                  {alert.match_factors?.different_bureaus === true && <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Different bureaus</span>}
                  {typeof alert.match_factors?.text_similarity === "number" && (
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      Text similarity: {Math.round(alert.match_factors.text_similarity * 100)}%
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="font-semibold text-slate-800">
              {modal.action === "link" ? "🔗 Link These Cases" : "✕ Dismiss This Alert"}
            </h2>
            {modal.action === "link" && (
              <div>
                <label className="text-xs text-slate-500 block mb-1">Lead Bureau (who takes ownership)</label>
                <input
                  className="input"
                  placeholder="e.g. PGRC or RB"
                  value={modalForm.lead_bureau}
                  onChange={e => setModalForm(f => ({ ...f, lead_bureau: e.target.value }))}
                />
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500 block mb-1">{modal.action === "link" ? "Link reason" : "Dismissal reason"} (required)</label>
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Explain the decision…"
                value={modalForm.reason}
                onChange={e => setModalForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={submitAction}
                disabled={submitting || !modalForm.reason.trim() || (modal.action === "link" && !modalForm.lead_bureau.trim())}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-50 ${modal.action === "link" ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}`}
              >
                {submitting ? "Saving…" : modal.action === "link" ? "Confirm Link" : "Confirm Dismiss"}
              </button>
              <button onClick={() => { setModal(null); setError(""); }} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

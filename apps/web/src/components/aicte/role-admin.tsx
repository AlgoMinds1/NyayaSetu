"use client";
// Role assignments: list (system_admin + auditor), grant and revoke (system_admin only). Every change is audited server-side.

import { useEffect, useState } from "react";

const ROLES = ["student","faculty","college_management","pgrc_triage_officer","bureau_officer","regional_officer","bureau_head","competent_authority","ombudsperson","auditor","system_admin"];
type Row = { id: string; role: string; bureau: string | null; region: string | null; granted_at: string; revoked_at: string | null; reason: string; user: { email: string | null } | null; granter: { email: string | null } | null; institution: { name: string } | null };

export default function RoleAdmin({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ user_id: "", role: "bureau_officer", institution_id: "", bureau: "", region: "", reason: "" });
  const [revokeId, setRevokeId] = useState(""), [revokeReason, setRevokeReason] = useState(""), [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/role-assignments").then(async res => ({ ok: res.ok, d: await res.json() })).then(({ ok, d }) => {
      if (!alive) return;
      if (!ok) setError(d.error ?? "Could not load."); else setRows(d.data);
    }).catch(() => { if (alive) setError("Could not load."); });
    return () => { alive = false; };
  }, [version]);

  async function grant(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    const res = await fetch("/api/admin/role-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      user_id: form.user_id, role: form.role, institution_id: form.institution_id || null, bureau: form.bureau || null, region: form.region || null, reason: form.reason,
    }) });
    const d = await res.json(); setBusy(false);
    if (!res.ok) { setError(d.error ?? "Could not grant role."); return; }
    setMessage("Role granted."); setForm({ ...form, user_id: "", reason: "" }); setVersion(v => v + 1);
  }

  async function revoke(id: string) {
    setBusy(true); setError(""); setMessage("");
    const res = await fetch(`/api/admin/role-assignments/${id}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: revokeReason }) });
    const d = await res.json(); setBusy(false);
    if (!res.ok) { setError(d.error ?? "Could not revoke role."); return; }
    setMessage("Role revoked."); setRevokeId(""); setRevokeReason(""); setVersion(v => v + 1);
  }

  const input = "border border-slate-300 rounded px-2 py-1 text-sm w-full";
  return (
    <div className="space-y-6">
      {canManage && (
        <form onSubmit={grant} className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Grant a role</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs text-slate-600">User ID (must have an active profile)<input className={input} required value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} /></label>
            <label className="text-xs text-slate-600">Role<select className={input} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
            <label className="text-xs text-slate-600">Institution ID (college roles)<input className={input} value={form.institution_id} onChange={e => setForm({ ...form, institution_id: e.target.value })} /></label>
            <label className="text-xs text-slate-600">Bureau (officer roles)<input className={input} value={form.bureau} onChange={e => setForm({ ...form, bureau: e.target.value })} /></label>
            <label className="text-xs text-slate-600">Region (regional officer)<input className={input} value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} /></label>
            <label className="text-xs text-slate-600">Reason (required)<input className={input} required minLength={3} maxLength={1000} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></label>
          </div>
          <button disabled={busy} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">{busy ? "Saving…" : "Grant role"}</button>
        </form>
      )}
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {message && <p className="text-sm text-green-700" role="status">{message}</p>}
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Bureau / institution / region</th><th className="px-3 py-2">Granted by</th><th className="px-3 py-2">Granted</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Reason</th>{canManage && <th className="px-3 py-2" />}</tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2">{r.user?.email ?? "—"}</td>
                <td className="px-3 py-2">{r.role}</td>
                <td className="px-3 py-2">{r.bureau ?? r.institution?.name ?? r.region ?? "—"}</td>
                <td className="px-3 py-2">{r.granter?.email ?? "—"}</td>
                <td className="px-3 py-2">{new Date(r.granted_at).toLocaleString()}</td>
                <td className="px-3 py-2">{r.revoked_at ? `Revoked ${new Date(r.revoked_at).toLocaleDateString()}` : <span className="text-green-700">Active</span>}</td>
                <td className="px-3 py-2 max-w-xs">{r.reason}</td>
                {canManage && (
                  <td className="px-3 py-2">
                    {!r.revoked_at && (revokeId === r.id ? (
                      <div className="space-y-1">
                        <input className={input} placeholder="Reason (required)" value={revokeReason} onChange={e => setRevokeReason(e.target.value)} />
                        <button disabled={busy || revokeReason.trim().length < 3} onClick={() => revoke(r.id)} className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50">Confirm revoke</button>
                      </div>
                    ) : (
                      <button onClick={() => setRevokeId(r.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Revoke</button>
                    ))}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400">No role assignments.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

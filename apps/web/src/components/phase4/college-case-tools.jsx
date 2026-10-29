"use client";
import { useState } from "react";
export function CollegeCaseTools({ caseId, faculty, assigned }) { const [member, setMember] = useState(""); const [action, setAction] = useState(""); const [date, setDate] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); async function send(path, body) { setBusy(true); setMessage(""); try {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok)
        throw new Error(d.error?.message ?? d.error ?? "Could not save.");
    setMessage("Saved.");
    return true;
}
catch (e) {
    setMessage(e instanceof Error ? e.message : "Could not save.");
    return false;
}
finally {
    setBusy(false);
} } async function assign() { if (!member)
    return; const ok = await send(`/api/college/cases/${caseId}/committee`, { faculty_user_id: member }); if (ok)
    setMember(""); } async function deadline() { if (!action.trim() || !date) {
    setMessage("Enter an action and deadline.");
    return;
} await send(`/api/college/cases/${caseId}/deadline`, { next_action: action, next_action_at: new Date(date).toISOString() }); } return <><section className="p4-card"><h2>Committee assignment</h2><p className="muted">Assign institution faculty to support the response. The case will not be visible to faculty if it involves management or is confidential.</p>{assigned.map(m => <div className="p4-event" key={m.id}><strong>{m.name}</strong><span>Assigned faculty</span></div>)}<label>Faculty member <select value={member} onChange={e => setMember(e.target.value)}><option value="">Select faculty</option>{faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><button disabled={busy || !member} onClick={assign}>Assign committee member</button></section><section className="p4-card"><h2>Internal response deadline</h2><p className="muted">This is an institution planning date, separate from the official case deadline.</p><label>Next action <input value={action} onChange={e => setAction(e.target.value)} maxLength={200} placeholder="Prepare and submit institution response"/></label><label>Complete by <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)}/></label><button disabled={busy} onClick={deadline}>Save internal deadline</button></section>{message && <p className="p4-banner" role="status">{message}</p>}</>; }

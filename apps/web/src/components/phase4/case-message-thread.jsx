"use client";
import { useCallback, useEffect, useState } from "react";
export function CaseMessageThread({ caseId }) { const [items, setItems] = useState([]); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const load = useCallback(async () => { const r = await fetch(`/api/complaints/${caseId}/events`); const d = await r.json(); if (r.ok)
    setItems((d.events ?? []).filter((x) => x.event_type === "case_message")); }, [caseId]); useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]); async function send() { if (text.trim().length < 10) {
    setMessage("Enter at least 10 characters.");
    return;
} setBusy(true); setMessage(""); try {
    const r = await fetch(`/api/complaints/${caseId}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_type: "case_message", remarks: text.trim() }) });
    const d = await r.json();
    if (!r.ok)
        throw new Error(d.error?.message ?? d.error ?? "Message failed.");
    setText("");
    await load();
}
catch (e) {
    setMessage(e instanceof Error ? e.message : "Message failed.");
}
finally {
    setBusy(false);
} } return <section className="p4-card"><h2>Case messages</h2><p className="muted">Messages are visible to authorized participants in this case.</p>{items.map(m => <div className="p4-event" key={m.id}><div><strong>{m.actor_role.replaceAll("_", " ")}</strong><p>{m.remarks}</p></div><time>{new Date(m.event_at).toLocaleString()}</time></div>)}{!items.length && <p className="muted">No messages yet.</p>}<label>Message <textarea rows={3} maxLength={5000} value={text} onChange={e => setText(e.target.value)}/></label><button disabled={busy} onClick={send}>{busy ? "Sending…" : "Send message"}</button>{message && <p role="alert" className="error">{message}</p>}</section>; }

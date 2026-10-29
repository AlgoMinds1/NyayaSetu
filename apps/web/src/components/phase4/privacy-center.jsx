"use client";
import { useEffect, useState } from "react";
export function PrivacyCenter() { const [requests, setRequests] = useState([]); const [type, setType] = useState("data_export"); const [details, setDetails] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); async function load() { const r = await fetch("/api/student/privacy"); const d = await r.json(); if (r.ok)
    setRequests(d.requests ?? []); } useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []); async function submit() { setBusy(true); setMessage(""); try {
    const r = await fetch("/api/student/privacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_type: type, details }) });
    const d = await r.json();
    if (!r.ok)
        throw new Error(d.error?.message ?? d.error ?? "Request failed.");
    setMessage("Your privacy request was recorded.");
    setDetails("");
    await load();
}
catch (e) {
    setMessage(e instanceof Error ? e.message : "Request failed.");
}
finally {
    setBusy(false);
} } return <section className="p4-card"><h2>Privacy requests</h2><p className="muted">Request a copy of your data, correction of details, or account closure. Requests are reviewed by the project administrator; sensitive case history is retained according to the stated retention policy.</p><label>Request type <select value={type} onChange={e => setType(e.target.value)}><option value="data_export">Data export</option><option value="rectification">Correct my details</option><option value="account_closure">Close my account</option></select></label><label>Details (optional) <textarea rows={3} maxLength={2000} value={details} onChange={e => setDetails(e.target.value)}/></label><button disabled={busy} onClick={submit}>{busy ? "Sending…" : "Submit request"}</button>{message && <p role="status" className="p4-banner">{message}</p>}<h3>Your requests</h3>{requests.map(r => <div className="p4-event" key={r.id}><strong>{r.request_type.replaceAll("_", " ")}</strong><span>{r.status} · {new Date(r.created_at).toLocaleDateString()}</span></div>)}</section>; }

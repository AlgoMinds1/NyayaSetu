"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function FacultyCaseActions({ caseId, hearings }) { const router = useRouter(); const [response, setResponse] = useState(""); const [reason, setReason] = useState(""); const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [location, setLocation] = useState(""); const [url, setUrl] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); async function post(path, body) { setBusy(true); setMessage(""); try {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok)
        throw new Error(d.error?.message ?? d.error ?? "Request failed.");
    return d;
}
catch (e) {
    setMessage(e instanceof Error ? e.message : "Request failed.");
    return null;
}
finally {
    setBusy(false);
} } async function submitResponse() { if (response.trim().length < 10) {
    setMessage("Please provide at least 10 characters.");
    return;
} const d = await post(`/api/complaints/${caseId}/events`, { event_type: "faculty_response", remarks: response }); if (d) {
    setResponse("");
    setMessage("Response recorded.");
    router.refresh();
} } async function schedule() { if (!start) {
    setMessage("Choose a hearing time.");
    return;
} const d = await post(`/api/faculty/cases/${caseId}/hearings`, { starts_at: new Date(start).toISOString(), ends_at: end ? new Date(end).toISOString() : undefined, location: location || undefined, meeting_url: url || undefined }); if (d) {
    setMessage("Hearing scheduled.");
    router.refresh();
} } async function recuse() { if (reason.trim().length < 10) {
    setMessage("Explain the conflict in at least 10 characters.");
    return;
} const d = await post(`/api/faculty/cases/${caseId}/recuse`, { reason }); if (d)
    router.push("/faculty"); } return <><section className="p4-card"><h2>Submit response</h2><p className="muted">Your response will be added to the case timeline.</p><textarea rows={5} maxLength={5000} value={response} onChange={e => setResponse(e.target.value)}/><button disabled={busy} onClick={submitResponse}>{busy ? "Saving…" : "Submit response"}</button></section><section className="p4-card"><h2>Hearings</h2>{hearings.map(h => <div className="p4-event" key={h.id}><strong>{new Date(h.starts_at).toLocaleString()}</strong><span>{h.location ?? "Location not set"}{h.meeting_url && <> · <a href={h.meeting_url} target="_blank" rel="noreferrer">Join</a></>}</span></div>)}<label>Starts at <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)}/></label><label>Ends at (optional) <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}/></label><label>Location <input value={location} onChange={e => setLocation(e.target.value)} maxLength={300}/></label><label>Secure meeting URL <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…"/></label><button disabled={busy} onClick={schedule}>Schedule hearing</button></section><section className="p4-card"><h2>Conflict of interest</h2><p className="muted">Recusing yourself immediately removes your access to this case.</p><label>Reason <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={1000}/></label><button disabled={busy} className="p4-danger" onClick={recuse}>Record conflict and recuse</button></section>{message && <p className="p4-banner" role="status">{message}</p>}</>; }

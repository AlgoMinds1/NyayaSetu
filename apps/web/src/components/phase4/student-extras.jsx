"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function PostClosureTools({ caseId, appealEligible }) { const router = useRouter(); const [feedback, setFeedback] = useState(null); const [rating, setRating] = useState(5); const [comment, setComment] = useState(""); const [reason, setReason] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); useEffect(() => { fetch(`/api/complaints/${caseId}/feedback`).then(r => r.json()).then(d => { if (d.feedback) {
    setFeedback(d.feedback);
    setRating(d.feedback.rating);
    setComment(d.feedback.comment ?? "");
} }).catch(() => { }); }, [caseId]); async function send(url, body) { setBusy(true); setMessage(""); try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok)
        throw new Error(d.error?.message ?? d.error ?? "Could not save.");
    setMessage("Saved.");
    router.refresh();
    return d;
}
catch (e) {
    setMessage(e instanceof Error ? e.message : "Could not save.");
}
finally {
    setBusy(false);
} } return <div className="p4-tracks"><section className="p4-card"><h2>Case feedback</h2><p className="muted">Your feedback helps improve the process; it does not affect appeal eligibility.</p>{feedback && <p className="notice">Feedback already submitted. You can update it below.</p>}<label>Rating <select value={rating} onChange={e => setRating(Number(e.target.value))}>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></label><label>Comment <textarea rows={3} maxLength={2000} value={comment} onChange={e => setComment(e.target.value)}/></label><button disabled={busy} onClick={() => send(`/api/complaints/${caseId}/feedback`, { rating, comment })}>{busy ? "Saving…" : "Submit feedback"}</button></section>{appealEligible && <section className="p4-card"><h2>Submit an appeal</h2><p className="muted">Explain why you are appealing. Submission moves the case into appeal review.</p><label>Reason <textarea rows={4} minLength={10} maxLength={5000} value={reason} onChange={e => setReason(e.target.value)}/></label><button disabled={busy || reason.trim().length < 10} onClick={() => send(`/api/complaints/${caseId}/appeal`, { reason })}>{busy ? "Submitting…" : "Submit appeal"}</button></section>}{message && <p role="status" className="p4-banner">{message}</p>}</div>; }

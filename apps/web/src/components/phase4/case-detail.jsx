"use client";
import { useState } from "react";
import { CaseMessageThread } from "@/components/phase4/case-message-thread";
export function CaseDetail({ initial, events, mode }) {
    const [note, setNote] = useState("");
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [list, setList] = useState(events);
    async function addEvent(event_type) { setBusy(true); setError(""); try {
        let evidence_id;
        if (file) {
            const fd = new FormData();
            fd.set("file", file);
            const up = await fetch(`/api/complaints/${initial.id}/evidence`, { method: "POST", body: fd });
            const ud = await up.json();
            if (!up.ok)
                throw new Error(ud.error ?? "Evidence upload failed.");
            evidence_id = ud.evidence.id;
        }
        const r = await fetch(`/api/complaints/${initial.id}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_type, remarks: note || undefined, evidence_id }) });
        const d = await r.json();
        if (!r.ok)
            throw new Error(d.error ?? "Could not add update.");
        setList(v => [...v, d.event]);
        setNote("");
        setFile(null);
        location.reload();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Update failed.");
    }
    finally {
        setBusy(false);
    } }
    const tracks = [["Lifecycle", initial.status], ["Verification", initial.verification_status], ["Coordination", initial.coordination_status], ["Deadline", initial.deadline_status], ["Appeal", initial.appeal_status], ["Confidentiality", initial.is_confidential ? "Confidential" : "Standard"]];
    return <><section className="p4-card"><div className="p4-heading"><div><p className="p4-eyebrow">{initial.case_id}</p><h2>{initial.category} complaint</h2>{initial.institution?.name && <p>{initial.institution.name}</p>}</div><span className="p4-badge">{initial.status.replaceAll("_", " ")}</span></div>{mode === "student" && <p>{initial.description_text}</p>}{mode === "college" && <p className="muted">Complainant identity and allegation details are withheld. This case is referred to your institution for response.</p>}{mode === "aicte" && <p>{initial.description_text}</p>}</section>
 <section className="p4-tracks">{tracks.map(([a, b]) => <div className="p4-card" key={a}><small>{a}</small><strong>{b.replaceAll("_", " ")}</strong></div>)}</section>
 <section className="p4-card"><h2>Case timeline</h2>{list.length ? list.map(ev => <div className="p4-event" key={ev.id}><div><strong>{mode === "student" && ["pgrc_triage_officer", "bureau_officer", "bureau_head"].includes(ev.actor_role) ? "AICTE Officer" : ev.actor_role.replaceAll("_", " ")}</strong><p>{ev.event_type.replaceAll("_", " ")}{ev.remarks ? ` · ${ev.remarks}` : ""}</p></div><time>{new Date(ev.event_at).toLocaleString()}</time></div>) : <p className="muted">No visible updates yet.</p>}</section>
 {initial.status === "closed" && mode === "student" && <section className="p4-card"><h2>Outcome</h2><p>{initial.outcomeSummary || "This case has been closed. See the case timeline for the recorded decision."}</p>{initial.appeal_status === "eligible" ? <p className="p4-banner">An appeal is available for this case. Follow the appeal instructions provided by AICTE.</p> : <p>Appeal status: {initial.appeal_status.replaceAll("_", " ")}</p>}</section>}
 {mode !== "aicte" && <section className="p4-card"><h2>{mode === "college" ? "Submit institution response" : "Add evidence or update"}</h2><label>{mode === "college" ? "Response" : "Note (optional)"}<textarea rows={4} value={note} onChange={e => setNote(e.target.value)} maxLength={5000}/></label><label>Supporting file (optional)<input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>{error && <p className="error">{error}</p>}<button disabled={busy} onClick={() => addEvent(mode === "college" ? "officer_response" : file ? "evidence_added" : "complainant_update")}>{busy ? "Saving…" : mode === "college" ? "Submit response" : "Add update"}</button></section>}
 {mode !== "aicte" && <CaseMessageThread caseId={initial.id}/>}
 </>;
}

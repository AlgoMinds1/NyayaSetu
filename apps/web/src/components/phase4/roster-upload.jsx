"use client";
import { useState } from "react";
export function RosterUpload({ initialCount }) { const [file, setFile] = useState(null); const [count, setCount] = useState(initialCount); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); async function upload() { if (!file)
    return; setBusy(true); setMessage(""); const form = new FormData(); form.set("file", file); try {
    const r = await fetch("/api/college/roster", { method: "POST", body: form });
    const d = await r.json();
    if (!r.ok)
        throw new Error(d.error ?? "Upload failed.");
    setCount(d.version.row_count);
    setMessage(`Roster uploaded: ${d.version.row_count} students.`);
    setFile(null);
}
catch (e) {
    setMessage(e instanceof Error ? e.message : "Upload failed.");
}
finally {
    setBusy(false);
} } return <section className="p4-card"><div className="p4-heading"><div><p className="p4-eyebrow">Active roster</p><h2>{count.toLocaleString()} student rows</h2></div></div><p className="muted">Upload a CSV with <code>enrollment_no</code> and <code>name</code>; <code>programme</code> and <code>year</code> are optional. Maximum 10,000 rows and 5 MB.</p><input type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] ?? null)}/><button disabled={!file || busy} onClick={upload}>{busy ? "Uploading…" : "Upload roster CSV"}</button>{message && <p role="status">{message}</p>}</section>; }

"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
type Member = { id: string; name: string; role: string; user_id: string | null; effective_from: string };
const ROLES = ["chair", "member", "secretary", "nominee"];

export function CommitteeManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [name, setName] = useState(""), [role, setRole] = useState("member"), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function call(init: RequestInit, url = "/api/college/committee") {
    setError(""); setBusy(true);
    try { const r = await fetch(url, init); const d = await r.json(); if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Request failed."); router.refresh(); setName(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Request failed."); }
    finally { setBusy(false); }
  }
  return <>
    <section className="p4-card"><h2>Current members</h2>
      {members.length === 0 && <p className="muted">No committee members recorded yet.</p>}
      {members.map(m => <div className="p4-event" key={m.id}><div><strong>{m.name}</strong><p>{m.role} · since {m.effective_from}</p></div><button className="p4-linkbutton" disabled={busy} onClick={() => call({ method: "DELETE" }, `/api/college/committee?id=${m.id}`)}>End membership</button></div>)}
    </section>
    <form className="p4-card p4-form" onSubmit={e => { e.preventDefault(); call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, role }) }); }}>
      <h2>Add member</h2>
      <p className="muted">Ending a membership keeps the record for the compliance trail; it is never deleted.</p>
      <label>Name <input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={120}/></label>
      <label>Role <select value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(x => <option key={x}>{x}</option>)}</select></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? "Saving…" : "Add member"}</button>
    </form>
  </>;
}

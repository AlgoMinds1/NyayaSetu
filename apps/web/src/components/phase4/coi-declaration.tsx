"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Blocking declaration shown before any case details. A conflict triggers recusal and the case leaves this faculty member's list. */
export function CoiDeclaration({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [hasConflict, setHasConflict] = useState<boolean | null>(null), [reason, setReason] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (hasConflict === null) { setError("Choose one option."); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/faculty/cases/${caseId}/coi`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ has_conflict: hasConflict, reason }) });
      const d = await r.json(); if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Declaration failed. Check the reason and try again.");
      if (d.recused) { router.push("/faculty"); router.refresh(); } else router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Declaration failed."); }
    finally { setBusy(false); }
  }
  return <div className="p4-modal-backdrop"><form className="p4-card p4-modal" role="dialog" aria-modal="true" aria-labelledby="coi-title" onSubmit={submit}>
    <h2 id="coi-title">Conflict-of-interest declaration</h2>
    <p>Before you see the case details, confirm whether you have a personal or professional conflict with this complaint.</p>
    <label className="p4-check"><input type="radio" name="coi" checked={hasConflict === false} onChange={() => setHasConflict(false)}/> I have no conflict of interest</label>
    <label className="p4-check"><input type="radio" name="coi" checked={hasConflict === true} onChange={() => setHasConflict(true)}/> I have a conflict of interest</label>
    {hasConflict === true && <label>Describe the conflict <textarea value={reason} onChange={e => setReason(e.target.value)} minLength={10} maxLength={1000} rows={4} required/><small>Declaring a conflict removes this case from your list. The college will be asked to reassign it.</small></label>}
    {error && <p className="error" role="alert">{error}</p>}
    <button disabled={busy}>{busy ? "Saving…" : "Save declaration"}</button>
  </form></div>;
}

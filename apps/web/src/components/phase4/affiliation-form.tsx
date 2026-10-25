"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { IdScan, type ScanApply } from "@/components/ocr/id-scan";
type Institution = { id: string; name: string; aicte_permanent_id: string };
type Affiliation = { id: string; institution_id: string; type: string; status: "pending" | "verified" | "needs_review" | "unable_to_verify"; enrollment_no: string | null; programme: string | null };
const VERDICT: Record<Affiliation["status"], { label: string; text: string }> = {
  pending: { label: "Checking", text: "Your claim is being checked." },
  verified: { label: "Verified", text: "Your enrollment matched the college roster. Complaints route normally." },
  needs_review: { label: "Needs review", text: "Sent to the AICTE verification queue. It is not shared with your college, and your complaint priority is unchanged." },
  unable_to_verify: { label: "Unable to verify", text: "Held for AICTE review. This never lowers the priority of a safety complaint." },
};

export function AffiliationForm({ institutions, affiliations }: { institutions: Institution[]; affiliations: Affiliation[] }) {
  const router = useRouter();
  const [institution, setInstitution] = useState(""), [type, setType] = useState("current"), [enrollment, setEnrollment] = useState(""), [programme, setProgramme] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [ocr, setOcr] = useState<{ raw: string; confidence: number; corrected: Record<string, string> } | null>(null);
  const t = useTranslations("affiliation"), tc = useTranslations("complaint");
  const names = new Map(institutions.map(i => [i.id, i.name]));
  // Scan results only pre-fill the form. The reviewed values and redacted OCR text travel with the claim; the image never does.
  function applyScan({ raw, confidence, values }: ScanApply) {
    if (values.enrollment_no) setEnrollment(values.enrollment_no);
    if (values.programme) setProgramme(values.programme);
    const corrected = Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "string" && v.length > 0)) as Record<string, string>;
    setOcr({ raw, confidence, corrected });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const r = await fetch("/api/affiliations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institution_id: institution, type, enrollment_no: enrollment, programme, ...(ocr ? { ocr } : {}) }) });
      const d = await r.json(); if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Could not submit your claim.");
      setEnrollment(""); setProgramme(""); setOcr(null); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not submit your claim."); }
    finally { setBusy(false); }
  }
  return <>
    <section className="p4-card"><h2>Your affiliations</h2>
      {affiliations.length === 0 && <p className="muted">No affiliation claims yet. Add one below before filing a complaint.</p>}
      {affiliations.map(a => <div className="p4-event" key={a.id}><div><strong>{names.get(a.institution_id) ?? "Institution"}</strong><p>{a.type === "current_student" ? "Current student" : "Alumnus"}{a.enrollment_no ? ` · ${a.enrollment_no}` : ""}</p><p>{VERDICT[a.status].text}</p></div><span className="p4-badge">{VERDICT[a.status].label}</span></div>)}
    </section>
    <section className="p4-form">
      <h2>{t("scanTitle")}</h2>
      <p className="muted">{t("scanHint")}</p>
      <IdScan onApply={applyScan} />
    </section>
    <form className="p4-card p4-form" onSubmit={submit}>
      <h2>{t("title")}</h2>
      <p className="muted">Your enrollment number is checked against the roster your institution uploaded. OTP proves your contact details only.</p>
      <label>{tc("institution")} <select value={institution} onChange={e => setInstitution(e.target.value)} required><option value="">Choose an institution</option>{institutions.map(i => <option key={i.id} value={i.id}>{i.name} · {i.aicte_permanent_id}</option>)}</select></label>
      <label>{t("type")} <select value={type} onChange={e => setType(e.target.value)}><option value="current">Current student</option><option value="alumnus">Alumnus</option></select></label>
      <label>{t("enrollment")} <input value={enrollment} onChange={e => setEnrollment(e.target.value)} required maxLength={40} pattern="[A-Za-z0-9/\-]{3,40}" /></label>
      <label>{t("programme")} <input value={programme} onChange={e => setProgramme(e.target.value)} required maxLength={120} placeholder="e.g. B.Tech Computer Science" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy || !institution}>{busy ? "Checking…" : t("submit")}</button>
    </form>
  </>;
}

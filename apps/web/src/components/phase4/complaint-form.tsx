"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { get, set, del } from "idb-keyval";
import { IntegrationBadge } from "@/components/demo/integration-badge";
type Institution = { id: string; name: string; aicte_permanent_id: string };
type SpeechRec = { lang: string; interimResults: boolean; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type Draft = { institution: string; q: string; category: string; description: string; language: string; confidential: boolean; management: boolean; urgent: boolean; bureau: string };
const CATEGORIES = ["financial", "ragging", "academic", "infrastructure", "other"];
function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange); window.addEventListener("offline", onChange);
  return () => { window.removeEventListener("online", onChange); window.removeEventListener("offline", onChange); };
}

export function ComplaintForm({ institutions, intake = false }: { institutions: Institution[]; intake?: boolean }) {
  const router = useRouter(), draftKey = `nyayasetu-complaint-draft-${intake ? "intake" : "student"}`;
  const [q, setQ] = useState(""), [institution, setInstitution] = useState(""), [category, setCategory] = useState("academic");
  const [description, setDescription] = useState(""), [language, setLanguage] = useState("en"), [confidential, setConfidential] = useState(false), [management, setManagement] = useState(false);
  const [urgent, setUrgent] = useState(false), [bureau, setBureau] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState(""), [ready, setReady] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true), [draftReady, setDraftReady] = useState(false);
  const [listening, setListening] = useState(false), [voiceNote, setVoiceNote] = useState(""), [simulated, setSimulated] = useState(false), recRef = useRef<SpeechRec | null>(null);
  const t = useTranslations("complaint"), tc = useTranslations("common");
  function appendText(text: string) { setDescription(d => (d ? `${d.trimEnd()} ` : "") + text); setDuplicate(""); }
  // Browser speech recognition when available; otherwise the simulated Bhashini endpoint (no audio is sent).
  function speak() {
    setVoiceNote("");
    if (listening) { recRef.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Recognizer = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (Recognizer) {
      const rec = new Recognizer();
      rec.lang = language === "hi" ? "hi-IN" : "en-IN"; rec.interimResults = false;
      rec.onresult = e => appendText(e.results[0][0].transcript);
      rec.onerror = () => { setVoiceNote(t("speakFailed")); setListening(false); };
      rec.onend = () => setListening(false);
      recRef.current = rec; rec.start(); setListening(true);
      return;
    }
    setVoiceNote(t("speakUnsupported"));
    fetch("/api/voice/transcribe", { method: "POST" }).then(r => r.json()).then(d => { if (d.transcript) { appendText(d.transcript); setSimulated(true); setVoiceNote(d.provider ?? tc("simulated")); } else setVoiceNote(t("speakFailed")); }).catch(() => setVoiceNote(t("speakFailed")));
  }
  useEffect(() => {
    let alive = true;
    get<Partial<Draft>>(draftKey).then(d => {
      if (!alive) return;
      if (d) { setInstitution(d.institution ?? ""); setQ(d.q ?? ""); setCategory(d.category ?? "academic"); setDescription(d.description ?? ""); setLanguage(d.language ?? "en"); setConfidential(d.confidential ?? false); setManagement(d.management ?? false); setUrgent(d.urgent ?? false); setBureau(d.bureau ?? ""); }
      setReady(true);
    }).catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [draftKey]);
  useEffect(() => { if (ready) set(draftKey, { institution, q, category, description, language, confidential, management, urgent, bureau } satisfies Draft).catch(() => {}); }, [ready, draftKey, institution, q, category, description, language, confidential, management, urgent, bureau]);
  useEffect(() => {
    const goOnline = () => setDraftReady(true);
    window.addEventListener("online", goOnline);
    return () => window.removeEventListener("online", goOnline);
  }, []);
  const filtered = useMemo(() => institutions.filter(i => `${i.name} ${i.aicte_permanent_id}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8), [institutions, q]);
  async function checkDuplicates() {
    setDuplicate(""); setError("");
    if (!institution || description.trim().length < 10) { setError("Choose an institution and enter at least 10 characters first."); return; }
    setBusy(true);
    try { const r = await fetch("/api/student/duplicates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institution_id: institution, category, description }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error?.message ?? d.error ?? "Duplicate check failed."); setDuplicate(d.message); }
    catch (e) { setError(e instanceof Error ? e.message : "Duplicate check failed."); }
    finally { setBusy(false); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const sentences = description.trim().split(/[.!?]+/).filter(x => x.trim().length > 0);
    if (sentences.length < 2) { setError("Please provide at least two sentences."); return; }
    if (description.trim().length < 10 || description.length > 10000) { setError("Description must be between 10 and 10,000 characters."); return; }
    if (!institution) { setError("Choose an institution."); return; }
    if (!navigator.onLine) { setError("You’re offline. Your draft is saved in this browser; reconnect to submit it."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institution_id: institution, category, description_text: description, description_language: language, is_confidential: confidential, involves_management: management, urgency_status: urgent ? "urgent" : "untriaged", assigned_bureau: bureau || null }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error?.message ?? d.error ?? "Could not submit case.");
      await del(draftKey); router.push(`${intake ? "/aicte/cases" : "/student/cases"}/${d.complaint.id}`); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Submission failed."); }
    finally { setBusy(false); }
  }
  return <form className="p4-card p4-form" onSubmit={submit}>
    {!intake && <p className="p4-banner">Drafts are saved on this device and restored when you return. Submit when you’re back online.</p>}
    {!intake && !online && (description || q) && <p className="p4-banner" role="status">You’re offline. Your draft is saved on this device.</p>}
    {!intake && online && draftReady && (description || q) && <p className="p4-banner" role="status">Draft ready to submit. Review it and submit now; the server records the receipt time.</p>}
    <label>{t("institution")} <input value={q} onChange={e => { setQ(e.target.value); setInstitution(""); setDuplicate(""); }} placeholder="Search name or AICTE ID" required />{q && !institution && <div className="p4-options">{filtered.map(i => <button type="button" key={i.id} onClick={() => { setInstitution(i.id); setQ(`${i.name} · ${i.aicte_permanent_id}`); }}>{i.name} · {i.aicte_permanent_id}</button>)}</div>}</label>
    <label>{t("category")} <select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(x => <option key={x}>{x}</option>)}</select></label>
    <label>{t("description")} <textarea value={description} onChange={e => { setDescription(e.target.value); setDuplicate(""); }} minLength={10} maxLength={10000} rows={7} required placeholder="Describe the issue in at least two sentences."/><small>{description.length}/10,000 characters {description.trim().length > 0 && description.trim().length < 50 && <span className="p4-warning"> · Please add more detail (under 50 characters).</span>}</small></label>
    <div><button type="button" className="p4-linkbutton" onClick={speak} aria-pressed={listening}>{listening ? t("speakStop") : t("speak")}</button>{simulated && <IntegrationBadge kind="simulated" label="Simulated: Bhashini" />}{voiceNote && <small role="status"> {voiceNote}</small>}</div>
    {!intake && <><button type="button" className="p4-linkbutton" disabled={busy} onClick={checkDuplicates}>{busy ? "Checking…" : "Check for similar complaints"}</button>{duplicate && <p className="p4-banner" role="status">{duplicate}</p>}</>}
    {!intake && <label>{t("language")} <select value={language} onChange={e => setLanguage(e.target.value)}><option value="en">English</option><option value="hi">Hindi</option><option value="other">Other</option></select></label>}
    <label className="p4-check"><input type="checkbox" checked={confidential} onChange={e => setConfidential(e.target.checked)}/> {t("confidential")} <small>Only authorized AICTE officials will see confidential case details.</small></label>
    {["financial", "ragging", "academic", "infrastructure"].includes(category) && <label className="p4-check"><input type="checkbox" checked={management} onChange={e => setManagement(e.target.checked)}/> {t("management")}</label>}
    {intake && <><label className="p4-check"><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)}/> Mark as urgent</label><label>Assign bureau <select value={bureau} onChange={e => setBureau(e.target.value)}><option value="">Unassigned</option><option value="PGRC">PGRC</option><option value="RB">RB</option></select></label></>}
    {error && <p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy ? "Submitting…" : intake ? "Create case" : t("submit")}</button>
  </form>;
}

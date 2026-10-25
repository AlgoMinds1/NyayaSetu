"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PERSONAS = [
  { key: "student", label: "Student" },
  { key: "faculty", label: "Faculty" },
  { key: "college", label: "College officer" },
  { key: "pgrc", label: "AICTE PGRC" },
  { key: "rb", label: "AICTE RB" },
  { key: "mgmt", label: "Senior management" },
] as const;

export function DemoPersonaSwitcher({ currentPersona }: { currentPersona: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentPersona);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function switchPersona() {
    const persona = PERSONAS.find((item) => item.key === selected);
    if (!persona || persona.key === currentPersona) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `${persona.key}.demo@nyayasetu.test` }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not switch demo persona.");
      router.replace(result.redirectTo ?? "/aicte");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not switch demo persona.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2" aria-label="Demo persona controls">
      <span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold tracking-wide text-amber-800">DEMO MODE</span>
      <label className="sr-only" htmlFor="demo-persona">Switch demo persona</label>
      <select id="demo-persona" aria-label="Switch demo persona" value={selected} onChange={(event) => setSelected(event.target.value)} disabled={busy} className="max-w-36 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
        {PERSONAS.map((persona) => <option key={persona.key} value={persona.key}>{persona.label}</option>)}
      </select>
      <button type="button" onClick={switchPersona} disabled={busy || selected === currentPersona} className="!mt-0 !w-auto shrink-0 whitespace-nowrap rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-600 disabled:opacity-50">
        {busy ? "Switching…" : "Switch"}
      </button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

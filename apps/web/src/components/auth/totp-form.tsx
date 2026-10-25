"use client";
import { useEffect, useState } from "react";

type FactorSetup = { factorId?: string; qr?: string; secret?: string; aal2?: boolean };
export default function TotpForm() {
  const [setup, setSetup] = useState<FactorSetup>({}); const [code, setCode] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/auth/mfa").then(async (r) => { const data = await r.json(); if (r.status === 401) { window.location.replace("/auth/login"); return; } if (!r.ok) throw new Error(data.error); if (data.aal2) { window.location.replace("/"); return; } setSetup(data); }).catch((e: Error) => setError(e.message)); }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/auth/mfa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ factorId: setup.factorId, code }) });
    const result = await response.json(); setBusy(false); if (!response.ok) return setError(result.error ?? "Could not verify authenticator code."); window.location.href = result.redirectTo ?? "/";
  }
  return <section className="card"><div className="brand">NyayaSetu · Additional security</div><h1>Verify authenticator</h1><p className="muted">College management and AICTE accounts require an authenticator app for every protected portal session.</p>
    {setup.qr && <div className="notice"><p>Scan this QR code with your authenticator app:</p><img alt="Authenticator enrollment QR code" src={setup.qr} /><p>Manual setup key: <code>{setup.secret}</code></p></div>}
    {setup.aal2 ? <p className="notice">Two-factor authentication is already verified for this session.</p> : <form onSubmit={submit}><label htmlFor="code">6-digit authenticator code</label><input id="code" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /><button disabled={busy}>{busy ? "Verifying…" : "Verify and continue"}</button></form>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}

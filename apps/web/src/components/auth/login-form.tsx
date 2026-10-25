"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

const DEMO_DOMAIN_SUFFIX = "@nyayasetu.demo";

export default function LoginForm() {
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [busyLabel, setBusyLabel] = useState("");
  const params = useSearchParams();

  // One-click demo login — server generates + verifies OTP and sets session in one step
  async function demoLogin(acc: { label: string; email: string }) {
    setBusy(true); setBusyLabel(acc.label); setError("");
    try {
      const response = await fetch("/api/auth/demo-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: acc.email }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? "Demo sign-in failed. Please retry."); return; }
      window.location.assign(result.redirectTo ?? "/");
    } catch {
      setError("Could not reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false); setBusyLabel("");
    }
  }

  // Real accounts: still use OTP → verify flow
  async function sendOtpFor(targetEmail: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: targetEmail }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? "Could not send code. Please try again."); return; }
      window.location.assign(`/auth/verify?email=${encodeURIComponent(targetEmail)}`);
    } catch {
      setError("Could not reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendOtpFor(email);
  }

  const demoAccounts = [
    { label: "Student", email: "student.demo@nyayasetu.test" },
    { label: "Faculty", email: "faculty.demo@nyayasetu.test" },
    { label: "College", email: "college.demo@nyayasetu.test" },
    { label: "AICTE PGRC", email: "pgrc.demo@nyayasetu.test" },
    { label: "RB Officer", email: "rb.demo@nyayasetu.test" },
    { label: "Senior Mgmt", email: "mgmt.demo@nyayasetu.test" },
  ];

  return <section className="card"><div className="brand">NyayaSetu · CaseBridge AI</div><h1>Sign in securely</h1><p className="muted">Choose a demo persona to sign in instantly, or enter your registered email below.</p>
    {params.get("error") === "account_not_provisioned" && <p className="error">This account has no active portal role. Contact your administrator.</p>}
    <div style={{ marginBottom: "1.25rem", padding: "0.75rem", background: "#f8faf9", borderRadius: "8px", border: "1px solid #e1e7e4" }}>
      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Quick Select Persona</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {demoAccounts.map((acc) => (
          <button key={acc.email} type="button" disabled={busy} onClick={() => demoLogin(acc)}
            style={{ fontSize: "0.75rem", padding: "0.35rem 0.65rem", background: busyLabel === acc.label ? "#145b4a" : "#ffffff", color: busyLabel === acc.label ? "#ffffff" : "#1a202c", border: "1px solid #cbd5e0", borderRadius: "6px", cursor: busy ? "wait" : "pointer", fontWeight: 500, opacity: busy && busyLabel !== acc.label ? 0.5 : 1 }}>
            {busyLabel === acc.label ? "Signing in…" : acc.label}
          </button>
        ))}
      </div>
    </div>
    <form onSubmit={submit}><label htmlFor="email">Registered email</label><input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /><button disabled={busy}>{busy && !busyLabel ? "Sending code…" : "Send one-time code"}</button></form>
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}


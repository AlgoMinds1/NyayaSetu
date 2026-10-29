"use client";
import { useState } from "react";
export default function VerifyForm({ email, initialCode = "" }) {
    const [token, setToken] = useState(initialCode);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function submit(event) {
        event.preventDefault();
        setError("");
        if (!email)
            return setError("We lost track of your email. Go back to the login page and choose your account again.");
        setBusy(true);
        try {
            const response = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, token }) });
            const result = await response.json().catch(() => ({}));
            if (!response.ok)
                return setError(result.error ?? "Could not verify code. Please try again.");
            if (typeof result.redirectTo !== "string")
                return setError("Sign-in completed without a portal destination. Please try again.");
            window.location.href = result.redirectTo;
        }
        catch {
            setError("Could not reach the sign-in service. Check your connection and try again.");
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="card"><div className="brand">NyayaSetu · Sign in</div><h1>Enter your email code</h1><p className="muted">Code sent to {email || "your registered email"}.</p>
    {initialCode && <p className="success" style={{ background: "#e6f4ea", color: "#137333", padding: "0.5rem 0.75rem", borderRadius: "6px", fontSize: "0.875rem", marginBottom: "1rem" }}>Testing mode: demo code filled in automatically (<strong>{initialCode}</strong>).</p>}
    <form onSubmit={submit}><label htmlFor="token">One-time code</label><input id="token" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={10} required value={token} onChange={(e) => setToken(e.target.value.replace(/\s/g, ""))}/><button disabled={busy}>{busy ? "Checking…" : "Verify and continue"}</button></form>
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}

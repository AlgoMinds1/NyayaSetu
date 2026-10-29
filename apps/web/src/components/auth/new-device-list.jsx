"use client";
import { useState } from "react";
export default function NewDeviceList({ sessions }) {
    const [items, setItems] = useState(sessions);
    const [error, setError] = useState("");
    async function revoke(id) { setError(""); const r = await fetch(`/api/auth/sessions/${id}`, { method: "DELETE" }); const result = await r.json(); if (!r.ok)
        return setError(result.error ?? "Could not revoke device."); setItems(items.map((s) => s.id === id ? { ...s, revoked_at: new Date().toISOString() } : s)); }
    return <div>{items.length === 0 && <p className="muted">No session history yet.</p>}{items.map((item) => <article className="notice" key={item.id}><strong>{item.user_agent || "Unknown device"}</strong><p className="muted">{item.ip_address || "IP unavailable"} · Last active {new Date(item.last_seen_at).toLocaleString()}</p>{item.revoked_at ? <span>Revoked</span> : <button onClick={() => revoke(item.id)}>Revoke session</button>}</article>)}{error && <p className="error">{error}</p>}</div>;
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";

type Item = { id: string; title: string; body: string; link: string; read_at: string | null; created_at: string };

// In-app notifications for the signed-in user. Polls once a minute; RLS limits the rows to the user.
export function NotificationBell() {
  const t = useTranslations("bell");
  const [items, setItems] = useState<Item[]>([]), [unread, setUnread] = useState(0), [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.notifications ?? []); setUnread(d.unread ?? 0);
    } catch { /* offline: keep last list */ }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => { void load(); }, 0);
    const timer = setInterval(() => { void load(); }, 60000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  async function markRead(body: { ids: string[] } | { all: true }) {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);
    void load();
  }

  return <div style={{ position: "relative" }}>
    <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`${t("label")}${unread ? `, ${t("unread", { count: unread })}` : ""}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "1px solid currentColor", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "inherit" }}>
      <Bell size={16} aria-hidden="true" /> {t("label")}{unread > 0 && <strong aria-hidden="true">({unread})</strong>}
    </button>
    {open && <div role="dialog" aria-label={t("label")} style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 320, maxHeight: 420, overflowY: "auto", background: "var(--card, #fff)", color: "#111", border: "1px solid #ccc", borderRadius: 10, padding: 10, zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,.15)" }}>
      {unread > 0 && <button type="button" onClick={() => markRead({ all: true })} style={{ marginBottom: 8 }}>{t("markAllRead")}</button>}
      {items.length === 0 && <p className="muted">{t("empty")}</p>}
      {items.map(item => <div key={item.id} style={{ borderTop: "1px solid #eee", padding: "8px 0", opacity: item.read_at ? 0.7 : 1 }}>
        <strong>{item.title}</strong>
        <p style={{ margin: "4px 0", fontSize: 14 }}>{item.body}</p>
        <Link href={item.link} onClick={() => { if (!item.read_at) void markRead({ ids: [item.id] }); setOpen(false); }}>{t("open")}</Link>
      </div>)}
    </div>}
  </div>;
}

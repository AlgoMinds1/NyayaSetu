"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { NOTIFY_EVENTS, type NotifyEvent } from "@/lib/notify-events";

const CHANNELS = ["in_app", "email", "push"] as const;
type Channel = (typeof CHANNELS)[number];
type Pref = { event_type: string; channel: string; enabled: boolean };

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// The push toggle only appears when a public VAPID key is configured for this deployment.
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function PreferencesForm({ initial }: { initial: Pref[] }) {
  const t = useTranslations("settings"), te = useTranslations("events"), locale = useLocale();
  const [enabled, setEnabled] = useState<Map<string, boolean>>(() => new Map(initial.map(p => [`${p.event_type}:${p.channel}`, p.enabled])));
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [pushState, setPushState] = useState<"off" | "on">("off");
  const pushSupported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  const value = (event: NotifyEvent, channel: Channel) => enabled.get(`${event}:${channel}`) ?? true;
  function toggle(event: NotifyEvent, channel: Channel) {
    setEnabled(prev => new Map(prev).set(`${event}:${channel}`, !value(event, channel)));
  }

  async function save() {
    setBusy(true); setMessage("");
    try {
      const prefs = NOTIFY_EVENTS.flatMap(event => CHANNELS.map(channel => ({ event_type: event, channel, enabled: value(event, channel) })));
      const r = await fetch("/api/notifications/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: locale === "hi" ? "hi" : "en", prefs }) });
      if (!r.ok) throw new Error("save failed");
      setMessage(t("saved"));
    } catch { setMessage("Could not save preferences. Try again."); }
    finally { setBusy(false); }
  }

  async function enablePush() {
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setMessage("Notifications are blocked for this site."); return; }
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC) });
      const r = await fetch("/api/notifications/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error("subscribe failed");
      setPushState("on"); setMessage(t("pushEnabled"));
    } catch { setMessage("Push could not be enabled on this device."); }
  }

  return <section className="p4-card">
    <p className="muted">{t("intro")}</p>
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th align="left">{t("event")}</th>{CHANNELS.map(c => <th key={c}>{c === "in_app" ? t("inApp") : c === "email" ? t("email") : t("push")}</th>)}</tr></thead>
        <tbody>{NOTIFY_EVENTS.map(event => <tr key={event} style={{ borderTop: "1px solid #ddd" }}>
          <td style={{ padding: "8px 0" }}>{te(event)}</td>
          {CHANNELS.map(channel => <td key={channel} align="center"><input type="checkbox" aria-label={`${te(event)} ${channel}`} checked={value(event, channel)} onChange={() => toggle(event, channel)} /></td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" onClick={save} disabled={busy}>{t("save")}</button>
      {VAPID_PUBLIC ? (pushSupported
        ? (pushState === "off" && <button type="button" className="p4-linkbutton" onClick={enablePush}>{t("enablePush")}</button>)
        : <span className="muted">{t("pushUnsupported")}</span>)
        : <span className="muted">{t("pushDisabledServer")}</span>}
    </div>
    {message && <p role="status" style={{ marginTop: 8 }}>{message}</p>}
  </section>;
}

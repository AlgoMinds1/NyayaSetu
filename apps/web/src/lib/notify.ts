import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import en from "@/lib/i18n/messages/en.json";
import hi from "@/lib/i18n/messages/hi.json";
import type { NotifyEvent } from "@/lib/notify-events";

export { NOTIFY_EVENTS, type NotifyEvent } from "@/lib/notify-events";

type Db = ReturnType<typeof createAdminClient>;
type Complaint = { id: string; case_id: string; institution_id: string; submitted_by: string; assigned_bureau: string | null; assigned_officer: string | null; involves_management: boolean; is_confidential: boolean };

const MESSAGES: Record<string, typeof en> = { en, hi };
const LINK_PREFIX: Record<string, string> = { student: "/student/cases", faculty: "/faculty/cases", college_management: "/college/cases" };
// Sensitive cases (management involved or confidential) never reach the institution or its faculty.
const SENSITIVE_BLOCKED_ROLES = ["college_management", "faculty"];

export function renderNotice(locale: string, event: NotifyEvent, caseId: string) {
  const dict = (MESSAGES[locale] ?? en).notify[event];
  return { title: dict.title, body: dict.body.replace("{caseId}", caseId) };
}

function pushPublicKey() { return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ""; }
function pushPrivateKey() { return process.env.VAPID_PRIVATE_KEY || ""; }

async function usersForRole(db: Db, role: string, c: Complaint): Promise<string[]> {
  if (role === "student") return [c.submitted_by];
  if (role === "faculty") {
    const { data } = await db.from("participants").select("user_id").eq("complaint_id", c.id).eq("role", "faculty").is("removed_at", null);
    return (data ?? []).map((r) => r.user_id);
  }
  if (role === "bureau_officer" && c.assigned_officer) return [c.assigned_officer];
  let query = db.from("role_assignments").select("user_id").eq("role", role).is("revoked_at", null);
  if (role === "college_management") query = query.eq("institution_id", c.institution_id);
  else if (role === "bureau_officer" || role === "bureau_head") query = query.eq("bureau", c.assigned_bureau ?? "none");
  const { data } = await query;
  return (data ?? []).map((r) => r.user_id);
}

export async function sendEmail(to: string, subject: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.NOTIFY_FROM_EMAIL ?? "NyayaSetu <onboarding@resend.dev>", to: [to], subject, text }),
  });
  return res.ok;
}

async function sendPush(db: Db, subs: { id: string; endpoint: string; p256dh: string; auth: string }[], payload: object) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@nyayasetu.invalid", pushPublicKey(), pushPrivateKey());
  let delivered = false;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload));
      delivered = true;
      await db.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", sub.id);
    } catch (error) {
      const code = (error as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
    }
  }
  return delivered;
}

/**
 * Resolves recipients at send time from notification_policies and case participants, applies the
 * sensitive-case rule and per-user preferences, then records one row per user and channel.
 * Idempotent: `ref` distinguishes repeat events (an event id, or a date for deadline sweeps).
 * Message bodies carry the case id and event label only, never complaint text.
 * Never throws; failures are logged so callers can fire and forget.
 */
export async function notify(input: { event_type: NotifyEvent; complaint_id: string; ref?: string; actor_id?: string | null }): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: complaint } = await db.from("complaints")
      .select("id,case_id,institution_id,submitted_by,assigned_bureau,assigned_officer,involves_management,is_confidential")
      .eq("id", input.complaint_id).maybeSingle<Complaint>();
    if (!complaint) return;
    const sensitive = complaint.involves_management || complaint.is_confidential;

    const { data: policies } = await db.from("notification_policies").select("recipient_role,channel").eq("event_type", input.event_type).eq("is_active", true);
    const rolesToChannels = new Map<string, Set<string>>();
    for (const policy of policies ?? []) {
      if (sensitive && SENSITIVE_BLOCKED_ROLES.includes(policy.recipient_role)) continue;
      const channels = rolesToChannels.get(policy.recipient_role) ?? new Set<string>();
      channels.add(policy.channel);
      rolesToChannels.set(policy.recipient_role, channels);
    }

    const recipients = new Map<string, { role: string; channels: Set<string> }>();
    for (const [role, channels] of rolesToChannels) {
      for (const userId of await usersForRole(db, role, complaint)) {
        if (userId === input.actor_id) continue;
        const entry = recipients.get(userId) ?? { role, channels: new Set<string>() };
        channels.forEach((channel) => entry.channels.add(channel));
        recipients.set(userId, entry);
      }
    }
    if (recipients.size === 0) return;

    const ids = [...recipients.keys()];
    const [{ data: users }, { data: prefRows }, { data: subs }] = await Promise.all([
      db.from("users").select("id,email").in("id", ids).eq("is_active", true),
      db.from("notification_preferences").select("user_id,event_type,channel,enabled,language").in("user_id", ids),
      db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").in("user_id", ids),
    ]);
    const enabled = new Map<string, boolean>(), language = new Map<string, string>();
    for (const pref of prefRows ?? []) {
      if (pref.event_type === input.event_type) enabled.set(`${pref.user_id}:${pref.channel}`, pref.enabled);
      language.set(pref.user_id, pref.language);
    }
    const subsByUser = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>();
    for (const sub of subs ?? []) subsByUser.set(sub.user_id, [...(subsByUser.get(sub.user_id) ?? []), sub]);

    for (const user of users ?? []) {
      const recipient = recipients.get(user.id);
      if (!recipient) continue;
      const locale = language.get(user.id) ?? "en";
      const { title, body } = renderNotice(locale, input.event_type, complaint.case_id);
      const link = `${LINK_PREFIX[recipient.role] ?? "/aicte/cases"}/${complaint.id}`;

      for (const channel of recipient.channels) {
        if (enabled.get(`${user.id}:${channel}`) === false) continue;
        const userSubs = subsByUser.get(user.id) ?? [];
        const initial = channel === "in_app" ? "delivered"
          : channel === "email" ? (!process.env.RESEND_API_KEY ? "skipped_no_provider" : !user.email ? "no_address" : "pending")
          : !pushPublicKey() || !pushPrivateKey() ? "skipped_no_provider" : userSubs.length === 0 ? "no_subscription" : "pending";
        const { data: inserted } = await db.from("notifications").upsert({
          user_id: user.id, complaint_id: complaint.id, event_type: input.event_type, channel, status: initial,
          idempotency_key: [input.event_type, complaint.id, user.id, channel, input.ref ?? ""].join(":"),
          title, body, link, locale, sent_at: initial === "delivered" ? new Date().toISOString() : null,
        }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id");
        if (!inserted?.length || initial !== "pending") continue;

        let delivered = false;
        if (channel === "email") delivered = await sendEmail(user.email as string, title, `${body}\n\n${process.env.APP_URL ?? ""}${link}`);
        else delivered = await sendPush(db, userSubs, { title, body, link });
        await db.from("notifications").update({ status: delivered ? "sent" : "failed", sent_at: new Date().toISOString() }).eq("id", inserted[0].id);
      }
    }
  } catch (error) {
    console.error("[notify] dispatch failed", input.event_type, error instanceof Error ? error.message : error);
  }
}

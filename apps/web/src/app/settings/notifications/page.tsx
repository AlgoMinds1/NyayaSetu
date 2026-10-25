import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getApiSession } from "@/lib/auth/api-session";
import { ROLE_HOME } from "@/lib/auth/roles";
import { LanguageSelect } from "@/components/i18n/language-select";
import { NotificationBell } from "@/components/notifications/bell";
import { PreferencesForm } from "@/components/notifications/preferences-form";

export default async function NotificationSettings() {
  const auth = await getApiSession();
  if (!auth) redirect("/auth/login");
  const t = await getTranslations("settings");
  const { data } = await auth.supabase.from("notification_preferences").select("event_type,channel,enabled").eq("user_id", auth.session.userId);
  return <main className="portal p4-page">
    <header>
      <div>
        <Link href={ROLE_HOME[auth.session.role]}>← NyayaSetu</Link>
        <div className="brand">NyayaSetu · Settings</div>
        <h1>{t("title")}</h1>
      </div>
      <div className="p4-actions"><LanguageSelect /><NotificationBell /></div>
    </header>
    <p className="muted">{t("languageTitle")}</p>
    <PreferencesForm initial={data ?? []} />
  </main>;
}

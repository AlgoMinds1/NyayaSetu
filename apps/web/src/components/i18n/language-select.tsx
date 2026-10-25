"use client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LOCALE_COOKIE, LOCALES } from "@/lib/i18n/locale";

// Writes the locale cookie and refreshes so server components re-read messages.
export function LanguageSelect() {
  const t = useTranslations("common"), locale = useLocale(), router = useRouter();
  function change(value: string) {
    try { document.cookie = `${LOCALE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`; } catch { /* cookies blocked: keep current language */ }
    router.refresh();
  }
  return <label>
    <span className="muted">{t("language")} </span>
    <select value={locale} onChange={e => change(e.target.value)} aria-label={t("language")}>
      {LOCALES.map(code => <option key={code} value={code}>{code === "hi" ? t("hindi") : t("english")}</option>)}
    </select>
  </label>;
}

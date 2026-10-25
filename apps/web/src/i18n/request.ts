import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import en from "@/lib/i18n/messages/en.json";
import hi from "@/lib/i18n/messages/hi.json";
import { LOCALES, LOCALE_COOKIE } from "@/lib/i18n/locale";

// Locale comes from the nyaya_locale cookie (set by the language selector). URLs do not change.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requested = cookieStore.get(LOCALE_COOKIE)?.value ?? "";
  const locale = (LOCALES as readonly string[]).includes(requested) ? requested : "en";
  return { locale, messages: locale === "hi" ? hi : en };
});

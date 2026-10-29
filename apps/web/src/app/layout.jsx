import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { PwaRegister } from "@/components/phase4/pwa-register";
export const metadata = { title: "NyayaSetu", description: "AICTE student grievance coordination portal", icons: { icon: "/nyayasetu.svg", shortcut: "/nyayasetu.svg" } };
export default async function RootLayout({ children }) {
    const locale = await getLocale();
    const messages = await getMessages();
    return <html lang={locale}><body><NextIntlClientProvider locale={locale} messages={messages}><PwaRegister />{children}</NextIntlClientProvider></body></html>;
}

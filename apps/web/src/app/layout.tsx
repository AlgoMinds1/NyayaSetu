import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { PwaRegister } from "@/components/phase4/pwa-register";

export const metadata: Metadata = { title: "NyayaSetu", description: "AICTE student grievance coordination portal" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return <html lang={locale}><body><NextIntlClientProvider locale={locale} messages={messages}><PwaRegister />{children}</NextIntlClientProvider></body></html>;
}

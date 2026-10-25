import { cookies } from "next/headers";
import VerifyForm from "@/components/auth/verify-form";
import { DEMO_CODE_COOKIE, LOGIN_EMAIL_COOKIE } from "@/lib/auth/demo";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email: queryEmail = "" } = await searchParams;
  const cookieStore = await cookies();
  // The email normally arrives in the URL; the cookie covers browsers that strip query parameters.
  const email = queryEmail || cookieStore.get(LOGIN_EMAIL_COOKIE)?.value || "";
  // Set only outside production for demo accounts (see /api/auth/otp); expires after two minutes.
  const demoCode = process.env.NODE_ENV !== "production" ? cookieStore.get(DEMO_CODE_COOKIE)?.value ?? "" : "";
  return <main className="shell"><VerifyForm email={email} initialCode={demoCode} /></main>;
}

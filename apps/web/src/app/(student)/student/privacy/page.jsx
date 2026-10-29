import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiSession } from "@/lib/auth/api-session";
import { PrivacyCenter } from "@/components/phase4/privacy-center";
export default async function PrivacyPage() { const auth = await getApiSession(); if (!auth || auth.session.role !== "student")
    redirect("/auth/login"); return <main className="portal p4-page"><header><div><Link href="/student">← My cases</Link><div className="brand">NyayaSetu · Student</div><h1>Privacy centre</h1></div></header><PrivacyCenter /></main>; }

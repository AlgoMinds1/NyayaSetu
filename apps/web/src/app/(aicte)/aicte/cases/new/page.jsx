import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiSession } from "@/lib/auth/api-session";
import { ComplaintForm } from "@/components/phase4/complaint-form";
export default async function IntakePage() { const auth = await getApiSession(); if (!auth || auth.session.role !== "pgrc_triage_officer")
    redirect("/aicte/cases"); const { data } = await auth.supabase.from("institutions").select("id,name,aicte_permanent_id").eq("status", "active").is("deleted_at", null).order("name"); return <main className="portal p4-page"><header><div><Link href="/aicte/cases">← All cases</Link><div className="brand">NyayaSetu · AICTE</div><h1>New case intake</h1></div></header><p className="muted">Register a complaint on behalf of a complainant.</p><ComplaintForm institutions={data ?? []} intake/></main>; }

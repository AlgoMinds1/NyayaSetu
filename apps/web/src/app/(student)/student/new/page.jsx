import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiSession } from "@/lib/auth/api-session";
import { ComplaintForm } from "@/components/phase4/complaint-form";
export default async function NewComplaint() { const auth = await getApiSession(); if (!auth || auth.session.role !== "student")
    redirect("/auth/login"); const { data } = await auth.supabase.from("institutions").select("id,name,aicte_permanent_id").eq("status", "active").is("deleted_at", null).order("name"); return <main className="portal p4-page"><header><div><Link href="/student">← My cases</Link><div className="brand">NyayaSetu · Student</div><h1>File a complaint</h1></div></header><p className="muted">Describe what happened. Your complaint will receive a case number after submission.</p><ComplaintForm institutions={data ?? []}/></main>; }

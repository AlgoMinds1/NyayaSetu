import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiSession } from "@/lib/auth/api-session";
import { RosterUpload } from "@/components/phase4/roster-upload";
export default async function RosterPage() { const auth = await getApiSession(); if (!auth || auth.session.role !== "college_management" || !auth.session.institutionId)
    redirect("/auth/login"); const { data } = await auth.supabase.from("roster_versions").select("row_count").eq("institution_id", auth.session.institutionId).eq("is_active", true).maybeSingle(); return <main className="portal p4-page"><header><div><Link href="/college">← Referred cases</Link><div className="brand">NyayaSetu · Institution</div><h1>Student roster</h1></div></header><RosterUpload initialCount={data?.row_count ?? 0}/></main>; }

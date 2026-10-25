import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppSession } from "@/lib/auth/session";
import ReportsView from "@/components/aicte/reports-view";

export const metadata = { title: "Reports — NyayaSetu" };

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = user ? await getAppSession(user) : null;
  if (!session) return null;

  const { data: institutions } = await supabase.from("institutions").select("id,name").order("name");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/aicte" className="font-bold text-slate-800 text-lg">NyayaSetu</Link>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600 text-sm">Reports</span>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/aicte" className="text-slate-500 hover:text-slate-800">Dashboard</Link>
          <Link href="/aicte/assistant" className="text-slate-500 hover:text-slate-800">Policy assistant</Link>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">PS reports for your scope. Exports are recorded in the audit trail.</p>
        </div>
        <ReportsView institutions={(institutions ?? []).map((i) => ({ value: i.id, label: i.name }))} />
      </main>
    </div>
  );
}

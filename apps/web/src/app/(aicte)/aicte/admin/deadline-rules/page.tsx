import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppSession } from "@/lib/auth/session";

export const metadata = { title: "Deadline rules — NyayaSetu" };

export default async function DeadlineRulesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = user ? await getAppSession(user) : null;
  if (!session) return <p className="p-6 text-sm text-slate-600">Forbidden.</p>;

  const { data: rules } = await supabase.from("deadline_rules").select("id,name,route,category,days_to_deadline,source_citation,effective_from,is_active").order("route");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/aicte" className="font-bold text-slate-800 text-lg">NyayaSetu</Link>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600 text-sm">Deadline rules</span>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/aicte" className="text-slate-500 hover:text-slate-800">Dashboard</Link>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Deadline rules</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configurable demo values — not official AICTE rules.</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-3 py-2">Rule</th><th className="px-3 py-2">Route</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Days</th><th className="px-3 py-2">Source citation</th><th className="px-3 py-2">Effective from</th><th className="px-3 py-2">Status</th></tr>
            </thead>
            <tbody>
              {(rules ?? []).map(r => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 font-medium text-slate-700">{r.name}</td>
                  <td className="px-3 py-2">{r.route}</td>
                  <td className="px-3 py-2">{r.category ?? "All"}</td>
                  <td className="px-3 py-2">{r.days_to_deadline}</td>
                  <td className="px-3 py-2 max-w-md text-slate-600">{r.source_citation}</td>
                  <td className="px-3 py-2">{r.effective_from}</td>
                  <td className="px-3 py-2">{r.is_active ? <span className="text-green-700">Active</span> : <span className="text-slate-400">Inactive</span>}</td>
                </tr>
              ))}
              {(rules ?? []).length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400">No deadline rules.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">Changes are made by system administrators through the deadline rules API and are recorded in the audit trail with a reason.</p>
      </main>
    </div>
  );
}

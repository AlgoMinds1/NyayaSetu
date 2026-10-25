import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppSession } from "@/lib/auth/session";
import PolicyAssistant from "@/components/aicte/policy-assistant";
import { IntegrationBadge } from "@/components/demo/integration-badge";

export const metadata = { title: "Policy assistant — NyayaSetu" };

export default async function AssistantPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = user ? await getAppSession(user) : null;
  if (!session) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/aicte" className="font-bold text-slate-800 text-lg">NyayaSetu</Link>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600 text-sm">Policy assistant</span>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/aicte" className="text-slate-500 hover:text-slate-800">Dashboard</Link>
          <Link href="/aicte/reports" className="text-slate-500 hover:text-slate-800">Reports</Link>
        </nav>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Policy assistant</h1>
            <p className="text-sm text-slate-500 mt-0.5">Procedure questions only. Answers come from the policy corpus, with citations.</p>
          </div>
          <IntegrationBadge kind="simulated" label="Simulated LLM" />
        </div>
        <PolicyAssistant />
        <div className="text-xs text-slate-400 border-t border-slate-200 pt-4">
          Corpus: sample Markdown summaries for the demo. Replace with official documents before use.
        </div>
      </main>
    </div>
  );
}

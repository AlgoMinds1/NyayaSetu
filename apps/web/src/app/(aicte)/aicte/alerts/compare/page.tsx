// /aicte/alerts/compare?a=<id>&b=<id> — side-by-side comparison for a Potentially Related Cases alert

import Link from "next/link";
import OverlapCompare from "@/components/aicte/overlap-compare";

export const metadata = { title: "Compare Cases — NyayaSetu" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a = "", b = "" } = await searchParams;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
        <Link href="/aicte/alerts" className="text-slate-400 hover:text-slate-700 text-sm">← Alert Centre</Link>
        <span className="text-slate-300">|</span>
        <div>
          <h1 className="text-slate-800 font-semibold text-sm">Compare Cases</h1>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-6">
        <OverlapCompare a={a} b={b} />
      </main>
    </div>
  );
}

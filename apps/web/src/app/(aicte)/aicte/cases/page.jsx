// /aicte/cases — Case Table page
import CaseTable from "@/components/aicte/case-table";
import Link from "next/link";
export const metadata = { title: "All Cases — NyayaSetu AICTE" };
export default function CasesPage() {
    return (<div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
        <Link href="/aicte" className="text-slate-400 hover:text-slate-700 text-sm">← Dashboard</Link>
        <span className="text-slate-300">|</span>
        <h1 className="text-slate-800 font-semibold text-sm">All Cases</h1>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-500">Search, filter and manage all institution complaint cases.</p>
          <Link href="/aicte/cases/new" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + New Case
          </Link>
        </div>
        <CaseTable />
      </main>
    </div>);
}

// /aicte/alerts — Overlap Alert Centre page
import AlertCentre from "@/components/aicte/alert-centre";
import Link from "next/link";
export const metadata = { title: "Overlap Alert Centre — NyayaSetu" };
export default function AlertsPage() {
    return (<div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
        <Link href="/aicte" className="text-slate-400 hover:text-slate-700 text-sm">← Dashboard</Link>
        <span className="text-slate-300">|</span>
        <div>
          <h1 className="text-slate-800 font-semibold text-sm">Overlap Alert Centre</h1>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="mb-5">
          <p className="text-sm text-slate-500">
            Detect and manage cases where multiple Bureaus are handling the same institution, or where
            case descriptions suggest potential duplication of effort.
          </p>
        </div>
        <AlertCentre />
      </main>
    </div>);
}

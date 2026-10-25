"use client";
// Report picker, filters, one Recharts bar chart, table, text summary and export buttons.

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { IntegrationBadge } from "@/components/demo/integration-badge";

type Option = { value: string; label: string };
type Result = {
  type: string; title: string; generatedAt: string; columns: string[]; rows: (string | number)[][];
  summary: string; chart: { name: string; value: number }[]; footer: string;
};

const REPORTS: Option[] = [
  { value: "total_received", label: "Total cases received" },
  { value: "pending", label: "Pending" },
  { value: "under_process", label: "Under process" },
  { value: "disposed", label: "Disposed" },
  { value: "transferred", label: "Transferred" },
  { value: "beyond_timeline", label: "Beyond timeline" },
  { value: "institution_wise", label: "Institution-wise status" },
  { value: "bureau_wise", label: "Bureau-wise workload" },
  { value: "region_wise", label: "Region-wise status" },
];
const BUREAUS = ["PGRC", "RB"];
const REGIONS = ["North", "South-West", "East"];
const FIELD = "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white";

export default function ReportsView({ institutions }: { institutions: Option[] }) {
  const [type, setType] = useState("total_received");
  const [filters, setFilters] = useState({ from: "", to: "", bureau: "", region: "", institution: "" });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports/${type}?${query}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load report"); return r.json(); })
      .then((data: Result) => { if (!cancelled) { setResult(data); setError(null); } })
      .catch((e: Error) => { if (!cancelled) { setResult(null); setError(e.message); } })
    return () => { cancelled = true; };
  }, [type, query]);

  const exportUrl = (format: string) => `/api/reports/${type}?${query}${query ? "&" : ""}format=${format}`;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-white border border-slate-200 rounded-lg p-4">
        <select aria-label="Report" className={`${FIELD} md:col-span-2`} value={type} onChange={(e) => setType(e.target.value)}>
          {REPORTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <input aria-label="From date" type="date" className={FIELD} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input aria-label="To date" type="date" className={FIELD} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <select aria-label="Bureau" className={FIELD} value={filters.bureau} onChange={(e) => setFilters({ ...filters, bureau: e.target.value })}>
          <option value="">All bureaus</option>
          {BUREAUS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select aria-label="Region" className={FIELD} value={filters.region} onChange={(e) => setFilters({ ...filters, region: e.target.value })}>
          <option value="">All regions</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select aria-label="Institution" className={`${FIELD} md:col-span-3`} value={filters.institution} onChange={(e) => setFilters({ ...filters, institution: e.target.value })}>
          <option value="">All institutions</option>
          {institutions.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
        </select>
        <div className="md:col-span-3 flex flex-wrap gap-2 justify-end items-center">
          {(["csv", "xlsx", "pdf"] as const).map((f) => (
            <a key={f} href={exportUrl(f)} className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg">
              Export {f.toUpperCase()}
            </a>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!result && !error && <div className="text-sm text-slate-500">Loading report...</div>}

      {result && (
        <>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{result.title}</h2>
            <p className="text-sm text-slate-600 mt-1">{result.summary}</p>
            <p className="text-xs text-slate-400 mt-1">Generated {new Date(result.generatedAt).toLocaleString()}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={result.chart}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#2563eb" name="Cases" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>{result.columns.map((c) => <th key={c} className="text-left px-3 py-2 font-medium">{c}</th>)}</tr>
              </thead>
              <tbody>
                {result.rows.length === 0 && <tr><td className="px-3 py-3 text-slate-500" colSpan={result.columns.length}>No rows in scope.</td></tr>}
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {row.map((cell, j) => <td key={j} className="px-3 py-2 tabular-nums">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <footer className="flex flex-wrap items-center gap-2 text-xs text-slate-400 border-t border-slate-200 pt-4">
        <IntegrationBadge kind="data" label="Data source: synthetic DEMO data" />
        <span>Report scope follows your role (region, bureau or all).</span>
      </footer>
    </div>
  );
}

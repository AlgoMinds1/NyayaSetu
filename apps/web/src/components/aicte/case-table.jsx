"use client";
// Case table with 8 PS filter keys, sortable columns, pagination.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/state-machine";
const CATEGORIES = ["financial", "ragging", "academic", "infrastructure", "other"];
const BUREAUS = ["PGRC", "RB", "Other"];
const REGIONS = ["North", "South-West", "East"];
const STATUSES = Object.keys(STATUS_LABELS);
export default function CaseTable() {
    const router = useRouter();
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    // Filter state — 8 PS filter keys
    const [filters, setFilters] = useState({
        institution_name: "", aicte_id: "", case_id: "",
        bureau: "", region: "", category: "", status: "",
        date_from: "", date_to: "",
    });
    const load = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page), limit: "25" });
        Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
        fetch(`/api/complaints?${params}`)
            .then(r => r.json())
            .then(d => { setRows(d.data ?? []); setTotal(d.total ?? 0); setLoading(false); })
            .catch(() => setLoading(false));
    }, [page, filters]);
    useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
    const setFilter = (k, v) => {
        setFilters(f => ({ ...f, [k]: v }));
        setPage(1);
    };
    const totalPages = Math.ceil(total / 25);
    return (<div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
        <input className="col-span-2 input" placeholder="Institution name" value={filters.institution_name} onChange={e => setFilter("institution_name", e.target.value)}/>
        <input className="input" placeholder="AICTE Permanent ID" value={filters.aicte_id} onChange={e => setFilter("aicte_id", e.target.value)}/>
        <input className="input" placeholder="Case ID" value={filters.case_id} onChange={e => setFilter("case_id", e.target.value)}/>
        <select className="input" value={filters.bureau} onChange={e => setFilter("bureau", e.target.value)}>
          <option value="">All Bureaus</option>
          {BUREAUS.map(b => <option key={b}>{b}</option>)}
        </select>
        <select className="input" value={filters.region} onChange={e => setFilter("region", e.target.value)}>
          <option value="">All Regions</option>
          {REGIONS.map(r => <option key={r}>{r}</option>)}
        </select>
        <select className="input" value={filters.category} onChange={e => setFilter("category", e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} className="capitalize">{c}</option>)}
        </select>
        <select className="input" value={filters.status} onChange={e => setFilter("status", e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <input type="date" className="input" value={filters.date_from} onChange={e => setFilter("date_from", e.target.value)}/>
        <input type="date" className="input" value={filters.date_to} onChange={e => setFilter("date_to", e.target.value)}/>
        <button className="btn-ghost text-sm" onClick={() => { setFilters({ institution_name: "", aicte_id: "", case_id: "", bureau: "", region: "", category: "", status: "", date_from: "", date_to: "" }); setPage(1); }}>
          Clear
        </button>
      </div>

      {/* Count */}
      <div className="text-xs text-slate-500">{total.toLocaleString()} cases</div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {["Case ID", "Institution", "Category", "Status", "Bureau", "Officer", "Receipt", "Disposal", "Deadline"].map(h => (<th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-600">{h}</th>))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (<tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400 text-sm">Loading…</td></tr>) : rows.length === 0 ? (<tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400 text-sm">No cases found.</td></tr>) : rows.map(row => (<tr key={row.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => router.push(`/aicte/cases/${row.id}`)}>
                <td className="px-3 py-2 font-mono text-xs text-blue-700">
                  {row.case_id}
                  {row.is_demo && <span className="ml-1 text-[10px] bg-yellow-100 text-yellow-700 px-1 rounded">DEMO</span>}
                  {row.is_confidential && <span className="ml-1 text-[10px] bg-red-100 text-red-700 px-1 rounded">🔒</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800 truncate max-w-[180px]">{row.institutions?.name ?? "—"}</div>
                  <div className="text-[11px] text-slate-400">{row.institutions?.region}</div>
                </td>
                <td className="px-3 py-2 capitalize text-slate-600">{row.category}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">{row.assigned_bureau ?? <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2 text-slate-600 truncate max-w-[120px]">{row.users?.display_name ?? <span className="text-slate-300">Unassigned</span>}</td>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.receipt_date}</td>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.expected_disposal_at?.slice(0, 10) ?? "—"}</td>
                <td className="px-3 py-2">
                  {row.deadline_status === "overdue" && <span className="text-xs font-semibold text-red-600">⚠ Overdue</span>}
                  {row.deadline_status === "nearing" && <span className="text-xs font-semibold text-amber-600">⏰ Nearing</span>}
                  {row.deadline_status === "on_track" && <span className="text-xs text-green-600">On track</span>}
                  {row.deadline_status === "paused" && <span className="text-xs text-slate-400">Paused</span>}
                </td>
              </tr>))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (<div className="flex items-center gap-2 justify-end text-sm">
          <button className="btn-ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className="text-slate-500">Page {page} of {totalPages}</span>
          <button className="btn-ghost" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>)}
    </div>);
}

"use client";
// KPI tiles + bureau workload bar chart for the AICTE dashboard home.
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
const TILES = [
    { key: "total", label: "Total Cases", color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200" },
    { key: "pending", label: "Pending", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
    { key: "underProcess", label: "Under Process", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
    { key: "disposed", label: "Disposed", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
    { key: "transferred", label: "Transferred", color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200" },
    { key: "beyondTimeline", label: "Beyond Timeline", color: "text-red-700", bg: "bg-red-50", border: "border-red-300", urgent: true },
    { key: "outOfScope", label: "Out of Scope", color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200" },
];
export default function KpiDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const load = () => fetch("/api/dashboard/kpis")
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
        load();
        const id = setInterval(load, 30_000); // refresh every 30s
        return () => clearInterval(id);
    }, []);
    const bureauChartData = data
        ? Object.entries(data.bureauWorkload).map(([name, count]) => ({ name, count }))
        : [];
    return (<div className="space-y-6">
      {/* KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {TILES.map(({ key, label, color, bg, border, urgent }) => (<div key={key} className={`rounded-lg border ${border} ${bg} px-4 py-3 ${urgent ? "ring-2 ring-red-400 ring-offset-1" : ""}`}>
            <div className={`text-2xl font-bold tabular-nums ${color}`}>
              {loading ? "—" : (data?.[key] ?? 0).toLocaleString()}
            </div>
            <div className={`text-xs font-medium mt-0.5 ${urgent ? "text-red-600" : "text-slate-500"}`}>
              {label}
            </div>
          </div>))}
      </div>

      {/* Bureau Workload Chart */}
      {bureauChartData.length > 0 && (<div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Open Cases by Bureau / Cell</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={bureauChartData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }}/>
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false}/>
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {bureauChartData.map((_, i) => (<Cell key={i} fill={["#3b82f6", "#f59e0b", "#8b5cf6", "#10b981", "#f97316"][i % 5]}/>))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>)}
    </div>);
}

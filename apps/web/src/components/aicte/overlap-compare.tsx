"use client";
// Side-by-side comparison of two potentially related cases with factor breakdown and shared phrases.

import { useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_LABELS, STATUS_COLORS, type LifecycleStatus } from "@/lib/state-machine";

type Side = {
  id: string; case_id: string; category: string; status: string; assigned_bureau: string | null;
  receipt_date: string; description_text: string; description_language: string; institution: string | null;
};
type Factor = { name: string; label: string; value: number; weight: number; contribution: number };
type CompareData = {
  a: Side; b: Side; score: number; related: boolean; gated: boolean; threshold: number;
  factors: Factor[]; sharedPhrases: string[];
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wraps each shared phrase in <mark>, matching across any punctuation or spacing between words. */
function highlight(text: string, phrases: string[]) {
  if (phrases.length === 0) return text;
  const pattern = phrases
    .map(p => p.split(" ").map(escapeRegExp).join("[^\\p{L}\\p{M}\\p{N}]+"))
    .join("|");
  // split() with a capture group puts each match at an odd index.
  return text.split(new RegExp(`(${pattern})`, "giu")).map((part, i) =>
    i % 2 === 1 ? <mark key={i} className="bg-amber-200 text-slate-900 rounded px-0.5">{part}</mark> : part
  );
}

function CaseCard({ side, label, phrases }: { side: Side; label: string; phrases: string[] }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Case {label}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[side.status as LifecycleStatus] ?? "bg-slate-100 text-slate-500"}`}>
          {STATUS_LABELS[side.status as LifecycleStatus] ?? side.status}
        </span>
      </div>
      <div>
        <Link href={`/aicte/cases/${side.id}`} className="font-mono text-sm text-blue-600 hover:underline">{side.case_id}</Link>
        <div className="text-xs text-slate-400 mt-1">
          {side.institution ?? "—"} · <span className="capitalize">{side.category}</span> · {side.assigned_bureau ?? "Unassigned"} · {side.receipt_date}
        </div>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{highlight(side.description_text, phrases)}</p>
    </div>
  );
}

export default function OverlapCompare({ a, b }: { a: string; b: string }) {
  const [data, setData] = useState<CompareData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!a || !b) return;
    let cancelled = false;
    fetch(`/api/overlap/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`)
      .then(async r => {
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) setError(d.error ?? "Could not load the comparison.");
        else setData(d as CompareData);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setError("Could not load the comparison."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [a, b]);

  if (!a || !b) {
    return <div className="text-center py-12 text-slate-400 text-sm">Pass two case ids as <code>?a=</code> and <code>?b=</code>.</div>;
  }
  if (loading) return <div className="text-center py-12 text-slate-400 text-sm">Loading…</div>;
  if (error || !data) return <div className="text-center py-12 text-red-600 text-sm">{error || "Not found."}</div>;

  const percent = Math.round(data.score * 100);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="bg-white rounded-lg border border-amber-200 p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">🔍 Potentially Related Cases</span>
          <div className="mt-2 text-sm text-slate-600">
            Match strength: <strong className="text-amber-700">{percent}%</strong>
            <span className="text-slate-400"> · threshold {Math.round(data.threshold * 100)}%</span>
          </div>
        </div>
        <div className="text-xs text-slate-500 max-w-md">
          {data.gated
            ? "Capped below the threshold: the embedding similarity is too low (or missing) to count as related, whatever the other factors say."
            : data.related ? "Above the threshold. Review both cases before linking." : "Below the threshold. Not flagged as related."}
        </div>
      </div>

      {/* Side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        <CaseCard side={data.a} label="A" phrases={data.sharedPhrases} />
        <CaseCard side={data.b} label="B" phrases={data.sharedPhrases} />
      </div>

      {/* Factor breakdown */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Factor breakdown</div>
        <div className="divide-y divide-slate-100">
          {data.factors.map(f => (
            <div key={f.name} className="py-2 grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-x-4 gap-y-1 items-center text-sm">
              <div className="text-slate-700">{f.label}</div>
              <div className="hidden md:block h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-2 bg-amber-500 rounded-full" style={{ width: `${Math.min(100, f.contribution * 100)}%` }} />
              </div>
              <div className="text-xs text-slate-500 text-right tabular-nums">
                {(f.value * 100).toFixed(0)}% × {f.weight.toFixed(2)} = <strong className="text-slate-800">{(f.contribution * 100).toFixed(1)}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shared phrases */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-2">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Shared phrases</div>
        {data.sharedPhrases.length === 0 ? (
          <p className="text-sm text-slate-400">No shared phrases of three or more words.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.sharedPhrases.map(p => (
              <li key={p}><mark className="bg-amber-200 text-slate-900 rounded px-2 py-0.5 text-xs">{p}</mark></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

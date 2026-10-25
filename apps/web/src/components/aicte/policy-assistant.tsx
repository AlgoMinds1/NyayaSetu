"use client";
// Chat-style policy assistant. Each answer is a set of verbatim corpus passages with citations.

import { useState } from "react";
import { IntegrationBadge } from "@/components/demo/integration-badge";

type Passage = { document: string; section: string; page: string | null; text: string; similarity: number };
type Turn = { question: string; mode?: string; answer?: string | null; label?: string; passages?: Passage[]; error?: string };

export default function PolicyAssistant() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setQuestion("");
    try {
      const res = await fetch("/api/policy-assistant", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setTurns((t) => [...t, res.ok ? { question: q, ...data } : { question: q, error: data.error ?? "Request failed" }]);
    } catch {
      setTurns((t) => [...t, { question: q, error: "Network error. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 min-h-[12rem]">
        {turns.length === 0 && (
          <p className="text-sm text-slate-500">
            Ask about procedure: filing, triage, timelines, escalation or appeals. Answers quote the policy corpus and cite the source.
          </p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-auto max-w-[85%] rounded-lg bg-blue-600 text-white text-sm px-3 py-2">{turn.question}</div>
            <div className="max-w-[92%] rounded-lg bg-white border border-slate-200 p-3 space-y-3">
              {turn.error && <p className="text-sm text-red-700">{turn.error}</p>}
              {turn.label && <IntegrationBadge kind="simulated" label={turn.label} />}
              {turn.mode === "procedure_only" || turn.mode === "abstained" ? (
                <p className="text-sm text-slate-800">{turn.answer}</p>
              ) : null}
              {turn.mode === "extractive" && turn.passages?.map((p, j) => (
                <blockquote key={j} className="border-l-4 border-blue-300 pl-3 text-sm text-slate-800 whitespace-pre-line">
                  {p.text}
                  <footer className="mt-1 text-xs text-slate-500 not-italic">
                    Source: {p.document}, section &ldquo;{p.section}&rdquo;{p.page ? `, page ${p.page}` : ""}
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={ask} className="flex gap-2">
        <input
          aria-label="Policy question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="For example: how long does a fee refund case take?"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
        />
        <button disabled={busy || question.trim().length < 3}
          className="bg-blue-600 disabled:bg-slate-300 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
          {busy ? "Searching..." : "Ask"}
        </button>
      </form>
    </div>
  );
}

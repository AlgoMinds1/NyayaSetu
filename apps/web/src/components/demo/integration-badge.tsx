// Labels every integration as real, simulated, mock, future or data source so judges can see what is live.
export type IntegrationKind = "real" | "simulated" | "mock" | "future" | "data";

const STYLE: Record<IntegrationKind, string> = {
  real: "bg-green-50 text-green-700 border-green-200",
  simulated: "bg-amber-50 text-amber-700 border-amber-200",
  mock: "bg-slate-100 text-slate-600 border-slate-300",
  future: "bg-slate-50 text-slate-500 border-slate-200 border-dashed",
  data: "bg-blue-50 text-blue-700 border-blue-200",
};

export function IntegrationBadge({ kind, label }: { kind: IntegrationKind; label: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${STYLE[kind]}`}>
      {label}
    </span>
  );
}

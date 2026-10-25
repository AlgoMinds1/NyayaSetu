import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppSession } from "@/lib/auth/session";

// PS reports. Each report aggregates complaint rows fetched through the caller's own Supabase client,
// so RLS applies first; the role scope below narrows the result further, never widens it.

export const REPORT_TYPES = [
  "total_received", "pending", "under_process", "disposed", "transferred", "beyond_timeline",
  "institution_wise", "bureau_wise", "region_wise",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TITLES: Record<ReportType, string> = {
  total_received: "Total cases received",
  pending: "Pending cases",
  under_process: "Cases under process",
  disposed: "Disposed cases",
  transferred: "Transferred cases",
  beyond_timeline: "Cases beyond timeline",
  institution_wise: "Institution-wise status",
  bureau_wise: "Bureau-wise workload",
  region_wise: "Region-wise status",
};

export const REPORT_FOOTER = "Data source: synthetic DEMO data";

export type ReportFilters = { from?: string; to?: string; bureau?: string; region?: string; institutionId?: string };

export type ReportResult = {
  type: ReportType;
  title: string;
  generatedAt: string;
  filters: ReportFilters;
  columns: string[];
  rows: (string | number)[][];
  summary: string;
  chart: { name: string; value: number }[];
  footer: string;
};

type Row = {
  id: string; status: string; deadline_status: string; assigned_bureau: string | null; institution_id: string;
  institutions: { name: string; region: string } | null;
};

const PENDING = ["submitted", "under_triage", "referred", "awaiting_response"];
const DISPOSED = ["closed", "appeal_decided"];
const OPEN = ["submitted", "under_triage", "referred", "awaiting_response", "under_examination", "decision_recorded", "transferred", "appeal_submitted", "under_appeal_review"];
const BUREAU_SCOPED = ["bureau_officer", "pgrc_triage_officer", "bureau_head"];

export class ReportForbiddenError extends Error {}

/** Role scope: regional officer -> own region, bureau roles -> own bureau, other AICTE roles -> all. */
export function scopeFor(session: AppSession): Partial<ReportFilters> {
  if (session.role === "regional_officer") {
    if (!session.region) throw new ReportForbiddenError("Regional officer has no region assigned");
    return { region: session.region };
  }
  if (BUREAU_SCOPED.includes(session.role)) {
    if (!session.bureau) throw new ReportForbiddenError("Bureau role has no bureau assigned");
    return { bureau: session.bureau };
  }
  if (["competent_authority", "auditor", "ombudsperson", "system_admin"].includes(session.role)) return {};
  throw new ReportForbiddenError("Role cannot access AICTE reports");
}

async function fetchRows(supabase: SupabaseClient, filters: ReportFilters): Promise<Row[]> {
  let query = supabase.from("complaints")
    .select("id,status,deadline_status,assigned_bureau,institution_id,institutions!inner(name,region)")
    .limit(10000);
  if (filters.from) query = query.gte("submitted_at", `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte("submitted_at", `${filters.to}T23:59:59Z`);
  if (filters.bureau) query = query.eq("assigned_bureau", filters.bureau);
  if (filters.region) query = query.eq("institutions.region", filters.region);
  if (filters.institutionId) query = query.eq("institution_id", filters.institutionId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Row[];
}

function count(rows: Row[], pred: (r: Row) => boolean) {
  return rows.reduce((n, r) => n + (pred(r) ? 1 : 0), 0);
}

function groupBy(rows: Row[], key: (r: Row) => string) {
  const map = new Map<string, Row[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}

const groupRow = (label: string, rs: Row[]) => [
  label, rs.length,
  count(rs, (r) => OPEN.includes(r.status)),
  count(rs, (r) => DISPOSED.includes(r.status)),
  count(rs, (r) => r.deadline_status === "overdue"),
];
const GROUP_COLUMNS = ["Name", "Total", "Open", "Disposed", "Overdue"];

/** Runs one report. `scope` must come from scopeFor(session); callers merge it over user filters. */
export async function runReport(
  supabase: SupabaseClient, type: ReportType, userFilters: ReportFilters, scope: Partial<ReportFilters>,
): Promise<ReportResult> {
  const filters: ReportFilters = { ...userFilters, ...scope };
  const rows = await fetchRows(supabase, filters);
  const base = { type, title: REPORT_TITLES[type], generatedAt: new Date().toISOString(), filters, footer: REPORT_FOOTER };

  switch (type) {
    case "total_received": {
      const byStatus = groupBy(rows, (r) => r.status);
      const table = [...byStatus].map(([s, rs]) => [s.replace(/_/g, " "), rs.length]);
      return { ...base, columns: ["Status", "Cases"], rows: table, summary: `${rows.length} cases received in the selected scope.`,
        chart: table.map(([name, value]) => ({ name: String(name), value: Number(value) })) };
    }
    case "pending":
    case "under_process":
    case "disposed":
    case "transferred":
    case "beyond_timeline": {
      const pred: Record<string, (r: Row) => boolean> = {
        pending: (r) => PENDING.includes(r.status),
        under_process: (r) => r.status === "under_examination",
        disposed: (r) => DISPOSED.includes(r.status),
        transferred: (r) => r.status === "transferred",
        beyond_timeline: (r) => r.deadline_status === "overdue",
      };
      const matched = rows.filter(pred[type]);
      const byBureau = groupBy(matched, (r) => r.assigned_bureau ?? "Unassigned");
      const table = [...byBureau].map(([b, rs]) => [b, rs.length]);
      return { ...base, columns: ["Bureau", "Cases"], rows: table,
        summary: `${matched.length} of ${rows.length} cases match "${REPORT_TITLES[type]}".`,
        chart: table.map(([name, value]) => ({ name: String(name), value: Number(value) })) };
    }
    case "institution_wise": {
      const groups = [...groupBy(rows, (r) => r.institutions?.name ?? r.institution_id)].map(([n, rs]) => groupRow(n, rs));
      return { ...base, columns: GROUP_COLUMNS, rows: groups, summary: `${groups.length} institutions in scope.`,
        chart: groups.map((g) => ({ name: String(g[0]), value: Number(g[1]) })) };
    }
    case "bureau_wise": {
      const groups = [...groupBy(rows, (r) => r.assigned_bureau ?? "Unassigned")].map(([n, rs]) => groupRow(n, rs));
      return { ...base, columns: GROUP_COLUMNS, rows: groups, summary: `Open workload across ${groups.length} bureau(x).`,
        chart: groups.map((g) => ({ name: String(g[0]), value: Number(g[2]) })) };
    }
    case "region_wise": {
      const groups = [...groupBy(rows, (r) => r.institutions?.region ?? "Unknown")].map(([n, rs]) => groupRow(n, rs));
      return { ...base, columns: GROUP_COLUMNS, rows: groups, summary: `${groups.length} regions in scope.`,
        chart: groups.map((g) => ({ name: String(g[0]), value: Number(g[1]) })) };
    }
  }
}

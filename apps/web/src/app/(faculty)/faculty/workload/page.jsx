import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiSession } from "@/lib/auth/api-session";
import LogoutButton from "@/components/auth/logout-button";
export const metadata = { title: "My Workload — NyayaSetu Faculty" };
function daysUntil(date) {
    if (!date)
        return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}
export default async function FacultyWorkload() {
    const auth = await getApiSession();
    if (!auth || auth.session.role !== "faculty")
        redirect("/auth/login");
    // All complaints assigned to this faculty member
    const { data: parts } = await auth.supabase
        .from("participants")
        .select("complaint_id")
        .eq("user_id", auth.session.userId)
        .eq("role", "faculty")
        .is("removed_at", null);
    const ids = (parts ?? []).map((x) => x.complaint_id);
    const { data: complaints } = ids.length
        ? await auth.supabase
            .from("complaints")
            .select("id,case_id,category,status,receipt_date,expected_disposal_at,next_action_at,deadline_status")
            .in("id", ids)
            .order("expected_disposal_at", { ascending: true, nullsFirst: false })
        : { data: [] };
    const rows = complaints ?? [];
    const open = rows.filter((r) => !["closed", "appeal_decided", "out_of_scope"].includes(r.status));
    const overdue = open.filter((r) => r.deadline_status === "overdue");
    const nearing = open.filter((r) => r.deadline_status === "nearing");
    const onTrack = open.filter((r) => !["overdue", "nearing"].includes(r.deadline_status ?? ""));
    return (<main className="portal p4-page">
      <header>
        <div>
          <Link href="/faculty">← Assigned cases</Link>
          <div className="brand">NyayaSetu · Faculty</div>
          <h1>My workload</h1>
        </div>
        <LogoutButton />
      </header>

      <p className="muted">
        Open tasks assigned to you. Deadlines are computed from case receipt date and institution rules.
      </p>

      {/* Summary row */}
      <div className="p4-tracks">
        <div className="p4-card">
          <small>Open tasks</small>
          <strong>{open.length}</strong>
        </div>
        <div className="p4-card">
          <small>Overdue</small>
          <strong style={{ color: overdue.length ? "var(--p4-danger)" : "inherit" }}>{overdue.length}</strong>
        </div>
        <div className="p4-card">
          <small>Deadline nearing</small>
          <strong style={{ color: nearing.length ? "var(--p4-warn)" : "inherit" }}>{nearing.length}</strong>
        </div>
        <div className="p4-card">
          <small>On track</small>
          <strong>{onTrack.length}</strong>
        </div>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (<section className="p4-card">
          <h2>Overdue</h2>
          {overdue.map((r) => {
                const d = daysUntil(r.expected_disposal_at);
                return (<div className="p4-event" key={r.id}>
                <div>
                  <strong><Link href={`/faculty/cases/${r.id}`}>{r.case_id}</Link></strong>
                  <p>{r.category} · {r.status.replaceAll("_", " ")}</p>
                </div>
                <span style={{ color: "var(--p4-danger)" }}>
                  {d !== null ? `${Math.abs(d)} day${Math.abs(d) !== 1 ? "s" : ""} overdue` : "No deadline set"}
                </span>
              </div>);
            })}
        </section>)}

      {/* Nearing deadline */}
      {nearing.length > 0 && (<section className="p4-card">
          <h2>Deadline nearing</h2>
          {nearing.map((r) => {
                const d = daysUntil(r.expected_disposal_at);
                return (<div className="p4-event" key={r.id}>
                <div>
                  <strong><Link href={`/faculty/cases/${r.id}`}>{r.case_id}</Link></strong>
                  <p>{r.category} · {r.status.replaceAll("_", " ")}</p>
                </div>
                <span style={{ color: "var(--p4-warn)" }}>
                  {d !== null ? `${d} day${d !== 1 ? "s" : ""} left` : "No deadline set"}
                </span>
              </div>);
            })}
        </section>)}

      {/* On track */}
      <section className="p4-card">
        <h2>All open tasks</h2>
        {open.length === 0 && <p className="muted">No open tasks assigned to you.</p>}
        {open.map((r) => {
            const d = daysUntil(r.expected_disposal_at);
            return (<div className="p4-event" key={r.id}>
              <div>
                <strong><Link href={`/faculty/cases/${r.id}`}>{r.case_id}</Link></strong>
                <p>
                  {r.category} · {r.status.replaceAll("_", " ")}
                  {r.next_action_at && (<> · Next action: {new Date(r.next_action_at).toLocaleDateString()}</>)}
                </p>
              </div>
              <span>
                {d !== null
                    ? d < 0
                        ? `${Math.abs(d)}d overdue`
                        : `${d}d left`
                    : "No deadline"}
              </span>
            </div>);
        })}
      </section>
    </main>);
}

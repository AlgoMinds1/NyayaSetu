import Link from "next/link";
export function CaseList({ rows, base }) {
    if (!rows.length)
        return <section className="p4-card"><p>No cases to show yet.</p></section>;
    return <section className="p4-card p4-table-wrap"><table className="p4-table"><thead><tr><th>Case</th><th>Category</th><th>Status</th><th>Received</th><th>Last action</th>{base === "/college/cases" && <th>Deadline</th>}</tr></thead><tbody>{rows.map((c) => <tr key={c.id}><td><Link href={`${base}/${c.id}`}>{c.case_id}</Link></td><td>{c.category}</td><td><span className="p4-badge">{c.status.replaceAll("_", " ")}</span></td><td>{c.receipt_date}</td><td>{c.last_action_at ? new Date(c.last_action_at).toLocaleDateString() : "—"}</td>{base === "/college/cases" && <td>{c.deadline_status ?? "—"}</td>}</tr>)}</tbody></table></section>;
}

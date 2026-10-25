import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppSession } from "@/lib/auth/session";
import RoleAdmin from "@/components/aicte/role-admin";

export const metadata = { title: "Role assignments — NyayaSetu" };

export default async function RolesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = user ? await getAppSession(user) : null;
  if (!session || !["system_admin", "auditor"].includes(session.role)) return <p className="p-6 text-sm text-slate-600">Forbidden.</p>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/aicte" className="font-bold text-slate-800 text-lg">NyayaSetu</Link>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600 text-sm">Role assignments</span>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/aicte" className="text-slate-500 hover:text-slate-800">Dashboard</Link>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Role assignments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Active and revoked roles. Grants and revocations require a reason and are recorded in the audit trail.</p>
        </div>
        <RoleAdmin canManage={session.role === "system_admin"} />
      </main>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewDeviceList from "@/components/auth/new-device-list";
import { cookies } from "next/headers";
import { getAppSession } from "@/lib/auth/session";
export default async function NewDevicePage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        redirect("/auth/login");
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("nyaya_session")?.value;
    if (!sessionId)
        redirect("/auth/login");
    const { data: currentSession } = await supabase.from("user_sessions").select("id").eq("auth_session_id", sessionId).eq("user_id", user.id).is("revoked_at", null).maybeSingle();
    if (!currentSession)
        redirect("/auth/login");
    const appSession = await getAppSession(user);
    if (!appSession || (appSession.role !== "student" && appSession.aal !== "aal2"))
        redirect("/auth/login");
    const { data } = await supabase.from("user_sessions").select("id,user_agent,ip_address,first_seen_at,last_seen_at,revoked_at").eq("user_id", user.id).order("last_seen_at", { ascending: false }).limit(20);
    return <main className="shell"><section className="card"><div className="brand">NyayaSetu · Account security</div><h1>Your signed-in devices</h1><p className="muted">Revoking a device blocks its NyayaSetu session on the next request.</p><NewDeviceList sessions={data ?? []}/></section></main>;
}

import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/supabase/env";
import TotpForm from "@/components/auth/totp-form";
export default async function TotpPage() {
    const cookieStore = await cookies();
    const env = getPublicEnv();
    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        cookies: { getAll: () => cookieStore.getAll(), setAll: () => { } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        redirect("/auth/login");
    return <main className="shell"><TotpForm /></main>;
}

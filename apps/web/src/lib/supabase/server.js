import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/supabase/env";
export async function createClient() {
    const env = getPublicEnv();
    const cookieStore = await cookies();
    return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: (updates) => {
                try {
                    updates.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
                }
                catch { /* Server Components cannot write cookies; middleware refreshes sessions. */ }
            },
        },
    });
}

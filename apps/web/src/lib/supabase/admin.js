import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv, getServiceRoleKey } from "@/lib/supabase/env";
/** Server-only client. Never import this module into a Client Component. */
export function createAdminClient() {
    const env = getPublicEnv();
    return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, getServiceRoleKey(), {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

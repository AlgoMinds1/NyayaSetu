import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAppSession } from "@/lib/auth/session";

export async function getApiSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = user ? await getAppSession(user) : null;
  const isDemo = user?.email?.endsWith("@nyayasetu.test") === true
    || user?.email?.endsWith("@nyayasetu.demo") === true;
  return session ? { supabase, session, isDemo } : null;
}

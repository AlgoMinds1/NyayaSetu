import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { hasRequiredMfa, ROLES, type Role } from "@/lib/auth/roles";

export type AppSession = { userId: string; role: Role; institutionId: string | null; bureau: string | null; region: string | null; aal: string | null };

export async function hasActiveAppSession(userId: string) {
  const cookieStore = await cookies(); const sessionId = cookieStore.get("nyaya_session")?.value;
  if (!sessionId) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from("user_sessions").select("id").eq("auth_session_id", sessionId).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}

export async function getAppSession(user?: User | null): Promise<AppSession | null> {
  const supabase = await createClient();
  let authenticatedUser = user;
  if (!authenticatedUser) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    authenticatedUser = data.user;
  }
  const { data: profile, error: profileError } = await supabase.from("users").select("is_active").eq("id", authenticatedUser.id).maybeSingle();
  if (profileError || !profile?.is_active) return null;
  const { data: assignments, error: roleError } = await supabase.from("role_assignments")
    .select("role,institution_id,bureau,region,granted_at")
    .eq("user_id", authenticatedUser.id).is("revoked_at", null).order("granted_at", { ascending: false });
  if (roleError || !assignments?.length) return null;
  const chosen = assignments.find((row) => ROLES.includes(row.role as Role));
  if (!chosen) return null;
  const role = chosen.role as Role;
  let aal: string | null = null;
  if (!hasRequiredMfa(role, null)) {
    // MFA assurance reads session state from cookies. Validate this client first
    // so Supabase does not warn when the assurance helper accesses that state.
    const { data: verified, error: userError } = await supabase.auth.getUser();
    if (userError || verified.user?.id !== authenticatedUser.id) return null;
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    aal = assurance?.currentLevel ?? null;
  }
  return { userId: authenticatedUser.id, role, institutionId: chosen.institution_id, bureau: chosen.bureau, region: chosen.region, aal };
}

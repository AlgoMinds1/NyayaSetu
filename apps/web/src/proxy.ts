import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/supabase/env";
import { hasRequiredMfa, ROLES, type Role } from "@/lib/auth/roles";

const ROLE_PREFIX: Record<string, Role[]> = {
  "/student": ["student"], "/faculty": ["faculty"], "/college": ["college_management"],
  "/aicte": ["pgrc_triage_officer", "bureau_officer", "regional_officer", "bureau_head", "competent_authority", "ombudsperson", "auditor", "system_admin"],
};
// /sw.js and /.well-known are fetched by the browser on its own (service-worker updates, DevTools); they must not run the
// auth check, because a failed check clears the login cookies and can race with a login in progress.
// /api/notifications/deadlines is called by a cron, not a session; the route checks x-cron-secret itself.
const OPEN = ["/auth", "/api/auth", "/api/notifications/deadlines", "/api/reports/run-scheduled", "/_next", "/favicon.ico", "/manifest.webmanifest", "/nyayasetu.svg", "/sw.js", "/.well-known"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/" || OPEN.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }
  const env = getPublicEnv();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (updates) => { updates.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); updates.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); },
    },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  const isApi = path.startsWith("/api/");
  const reject = (status: number, destination?: string) => isApi
    ? NextResponse.json({ error: status === 401 ? "Unauthenticated" : "Forbidden" }, { status })
    : destination
      ? NextResponse.redirect(new URL(destination, request.url))
      : status === 401
        ? NextResponse.redirect(new URL("/auth/login", request.url))
        : new NextResponse("Forbidden", { status });
  if (error || !user) return reject(401, "/auth/login");
  const sessionId = request.cookies.get("nyaya_session")?.value;
  if (!sessionId) return reject(401, "/auth/login");
  const { data: activeSession, error: sessionError } = await supabase.from("user_sessions").select("id").eq("auth_session_id", sessionId).eq("user_id", user.id).is("revoked_at", null).maybeSingle();
  if (sessionError || !activeSession) return reject(401, "/auth/login");
  const { data: assignments, error: roleError } = await supabase.from("role_assignments").select("role,bureau,institution_id,region").eq("user_id", user.id).is("revoked_at", null);
  if (roleError || !assignments?.length) return reject(403, "/auth/login?error=account_not_provisioned");
  const assignment = assignments.find((item) => ROLES.includes(item.role as Role));
  if (!assignment) return reject(403);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const role = assignment.role as Role;
  if (!hasRequiredMfa(role, aal?.currentLevel)) return reject(403, "/auth/totp");
  const matchedPrefix = Object.keys(ROLE_PREFIX).find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (matchedPrefix && !ROLE_PREFIX[matchedPrefix].includes(role)) return reject(403);
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-user-id", user.id);
  forwardedHeaders.set("x-user-role", role);
  forwardedHeaders.set("x-user-institution", assignment.institution_id ?? "");
  forwardedHeaders.set("x-user-bureau", assignment.bureau ?? "");
  forwardedHeaders.set("x-user-region", assignment.region ?? "");
  const refreshedCookies = response.cookies.getAll();
  response = NextResponse.next({ request: { headers: forwardedHeaders } });
  refreshedCookies.forEach(({ name, value, ...options }) => response.cookies.set(name, value, options));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

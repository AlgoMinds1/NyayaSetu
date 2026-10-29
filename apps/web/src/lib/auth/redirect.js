import { hasRequiredMfa, ROLE_HOME } from "@/lib/auth/roles";
export function destinationFor(session) {
    if (!hasRequiredMfa(session.role, session.aal))
        return "/auth/totp";
    return ROLE_HOME[session.role];
}

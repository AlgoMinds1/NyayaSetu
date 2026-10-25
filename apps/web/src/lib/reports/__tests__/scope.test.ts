import { describe, expect, it } from "vitest";
import { ReportForbiddenError, scopeFor } from "@/lib/reports/queries";
import type { AppSession } from "@/lib/auth/session";

const session = (over: Partial<AppSession>): AppSession => ({
  userId: "u", role: "auditor", institutionId: null, bureau: null, region: null, aal: "aal2", ...over,
});

describe("report scope by role", () => {
  it("limits a regional officer to their region", () => {
    expect(scopeFor(session({ role: "regional_officer", region: "North" }))).toEqual({ region: "North" });
  });

  it("limits bureau roles to their bureau", () => {
    expect(scopeFor(session({ role: "bureau_officer", bureau: "RB" }))).toEqual({ bureau: "RB" });
    expect(scopeFor(session({ role: "bureau_head", bureau: "PGRC" }))).toEqual({ bureau: "PGRC" });
  });

  it("gives competent authority and auditors the full view", () => {
    expect(scopeFor(session({ role: "competent_authority" }))).toEqual({});
    expect(scopeFor(session({ role: "auditor" }))).toEqual({});
  });

  it("refuses roles outside the AICTE portal and scoped roles missing their assignment", () => {
    expect(() => scopeFor(session({ role: "student" }))).toThrow(ReportForbiddenError);
    expect(() => scopeFor(session({ role: "regional_officer", region: null }))).toThrow(ReportForbiddenError);
    expect(() => scopeFor(session({ role: "bureau_officer", bureau: null }))).toThrow(ReportForbiddenError);
  });
});

import { describe, expect, it } from "vitest";
import { canRoleEscalate, canRoleTransition, isValidTransition, validNextStates } from "@/lib/state-machine";

describe("state machine transitions", () => {
  it("allows the documented forward path", () => {
    expect(isValidTransition("submitted", "under_triage")).toBe(true);
    expect(isValidTransition("under_triage", "referred")).toBe(true);
    expect(isValidTransition("under_examination", "decision_recorded")).toBe(true);
    expect(isValidTransition("decision_recorded", "closed")).toBe(true);
  });

  it("rejects skipped and backward transitions", () => {
    expect(isValidTransition("submitted", "closed")).toBe(false);
    expect(isValidTransition("closed", "submitted")).toBe(false);
    expect(isValidTransition("under_examination", "under_triage")).toBe(false);
  });

  it("keeps out_of_scope terminal without a privileged reopen", () => {
    expect(validNextStates("out_of_scope")).toEqual([]);
    expect(isValidTransition("out_of_scope", "under_triage")).toBe(false);
  });

  it("limits transitions to the roles that may trigger them", () => {
    expect(canRoleTransition("under_triage", "referred", "pgrc_triage_officer")).toBe(true);
    expect(canRoleTransition("under_triage", "referred", "bureau_officer")).toBe(false);
    expect(canRoleTransition("under_triage", "transferred", "bureau_head")).toBe(true);
    expect(canRoleTransition("under_triage", "transferred", "student")).toBe(false);
  });

  it("treats an undefined role-transition pair as not allowed", () => {
    expect(canRoleTransition("submitted", "closed", "bureau_head")).toBe(false);
  });
});

describe("escalation", () => {
  it("lets bureau roles escalate open cases only", () => {
    expect(canRoleEscalate("under_examination", "bureau_officer")).toBe(true);
    expect(canRoleEscalate("referred", "bureau_head")).toBe(true);
    expect(canRoleEscalate("closed", "bureau_head")).toBe(false);
    expect(canRoleEscalate("out_of_scope", "bureau_officer")).toBe(false);
  });

  it("does not let other roles escalate", () => {
    expect(canRoleEscalate("under_examination", "student")).toBe(false);
    expect(canRoleEscalate("under_examination", "pgrc_triage_officer")).toBe(false);
  });
});

// src/lib/state-machine.ts
// Enforces valid case lifecycle transitions.
// Source: docs/state-machine.md — freeze before Phase 1.

export type LifecycleStatus =
  | "submitted" | "under_triage" | "referred" | "awaiting_response"
  | "under_examination" | "decision_recorded" | "closed" | "out_of_scope"
  | "transferred" | "appeal_submitted" | "under_appeal_review" | "appeal_decided";

const VALID_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  submitted:            ["under_triage"],
  under_triage:         ["referred", "under_examination", "out_of_scope", "transferred"],
  referred:             ["awaiting_response", "transferred"],
  awaiting_response:    ["under_examination", "transferred"],
  under_examination:    ["decision_recorded", "transferred"],
  decision_recorded:    ["closed"],
  closed:               ["appeal_submitted"],
  appeal_submitted:     ["under_appeal_review"],
  under_appeal_review:  ["appeal_decided"],
  appeal_decided:       ["closed", "under_examination"],
  out_of_scope:         [],  // no forward transition without privileged reopen event
  transferred:          ["under_triage"],
};

// Roles that may trigger each transition
const TRANSITION_ROLES: Partial<Record<string, string[]>> = {
  "submitted→under_triage":              ["pgrc_triage_officer"],
  "under_triage→referred":               ["pgrc_triage_officer"],
  "under_triage→under_examination":      ["pgrc_triage_officer", "bureau_officer"],
  "under_triage→out_of_scope":           ["pgrc_triage_officer"],
  "under_triage→transferred":            ["pgrc_triage_officer", "bureau_head"],
  "referred→awaiting_response":          ["pgrc_triage_officer", "bureau_officer"],
  "referred→transferred":                ["bureau_head"],
  "awaiting_response→under_examination": ["pgrc_triage_officer", "bureau_officer"],
  "awaiting_response→transferred":       ["bureau_head"],
  "under_examination→decision_recorded": ["bureau_officer", "bureau_head"],
  "under_examination→transferred":       ["bureau_head"],
  "decision_recorded→closed":            ["bureau_officer", "bureau_head"],
  "closed→appeal_submitted":             ["pgrc_triage_officer", "bureau_head"],
  "appeal_submitted→under_appeal_review":["ombudsperson"],
  "under_appeal_review→appeal_decided":  ["ombudsperson"],
  "appeal_decided→closed":              ["ombudsperson"],
  "appeal_decided→under_examination":   ["ombudsperson"],
  "transferred→under_triage":           ["pgrc_triage_officer", "bureau_officer", "bureau_head"],
};

export function isValidTransition(from: LifecycleStatus, to: LifecycleStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canRoleTransition(from: LifecycleStatus, to: LifecycleStatus, role: string): boolean {
  const key = `${from}→${to}`;
  const allowed = TRANSITION_ROLES[key];
  if (!allowed) return false;
  return allowed.includes(role);
}

// Escalation has no lifecycle enum value, so it is recorded as a case event and keeps the current status.
export const ESCALATE_ACTION = "escalate";
const ESCALATION_ROLES = ["bureau_officer", "bureau_head"];
const NON_OPEN_STATUSES: LifecycleStatus[] = ["closed", "out_of_scope"];

export function canRoleEscalate(from: LifecycleStatus, role: string): boolean {
  return !NON_OPEN_STATUSES.includes(from) && ESCALATION_ROLES.includes(role);
}

export function validNextStates(from: LifecycleStatus): LifecycleStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}

export const STATUS_LABELS: Record<LifecycleStatus, string> = {
  submitted:            "Submitted",
  under_triage:         "Under Triage",
  referred:             "Referred to Institution",
  awaiting_response:    "Awaiting Response",
  under_examination:    "Under Examination",
  decision_recorded:    "Decision Recorded",
  closed:               "Closed",
  out_of_scope:         "Out of Scope",
  transferred:          "Transferred",
  appeal_submitted:     "Appeal Submitted",
  under_appeal_review:  "Under Appeal Review",
  appeal_decided:       "Appeal Decided",
};

export const STATUS_COLORS: Record<LifecycleStatus, string> = {
  submitted:            "bg-blue-100 text-blue-800",
  under_triage:         "bg-amber-100 text-amber-800",
  referred:             "bg-purple-100 text-purple-800",
  awaiting_response:    "bg-yellow-100 text-yellow-800",
  under_examination:    "bg-orange-100 text-orange-800",
  decision_recorded:    "bg-teal-100 text-teal-800",
  closed:               "bg-green-100 text-green-800",
  out_of_scope:         "bg-slate-100 text-slate-600",
  transferred:          "bg-indigo-100 text-indigo-800",
  appeal_submitted:     "bg-rose-100 text-rose-800",
  under_appeal_review:  "bg-red-100 text-red-800",
  appeal_decided:       "bg-emerald-100 text-emerald-800",
};

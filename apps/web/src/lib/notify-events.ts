// Event types that can produce notifications. Shared by server dispatch and the preferences UI.
export const NOTIFY_EVENTS = ["status_changed", "referred_to_college", "hearing_scheduled", "deadline_nearing", "deadline_overdue", "decision_recorded", "appeal_submitted", "reassignment_needed", "case_message", "case_assigned", "feedback_received"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

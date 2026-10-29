export const COMPLAINT_DETAIL_SELECT = "id,case_id,institution_id,submitted_by,submitted_at,category,secondary_category,description_text,description_language,status,verification_status,coordination_status,deadline_status,appeal_status,urgency_status,assigned_bureau,assigned_officer,last_action_at,next_action,next_action_at,expected_disposal_at,is_confidential,involves_management,version";
/** RLS remains the authority; this helper never accepts caller-supplied tenant scope. */
export function getVisibleComplaint(client, complaintId) {
    return client.from("complaints").select(COMPLAINT_DETAIL_SELECT).eq("id", complaintId).maybeSingle();
}
export function getVisibleCaseEvents(client, complaintId) {
    return client.from("case_events").select("id,event_type,actor_role,bureau,remarks,visibility,event_at")
        .eq("complaint_id", complaintId).order("event_at", { ascending: true });
}

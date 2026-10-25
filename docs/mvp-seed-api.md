# Phase 0 MVP, synthetic seed, and API contracts

Planning only; no route implementation is authorized by this document. Contracts use UUID identifiers and ISO-8601 timestamps. All endpoints require authentication except explicitly public health/status. Common errors: `400` malformed input, `401` unauthenticated, `403` forbidden, `404` not visible/not found, `409` stale version or invalid transition, `422` domain validation, `429` rate limited.

## MVP scope

| Tier | Features |
|---|---|
| ✅ Definitely in | Four role-based portals on one backend; institution profiles and consolidated case history; complaint lifecycle with PS fields; both overlap alert types with explainable factors; link/dismiss with reason; synthetic-roster affiliation verification; server and RLS permissions; append-only hash-chained audit history; in-app and email essential notifications; labelled synthetic matcher set and measured precision/recall. |
| ⏳ If stable | OCR with correction/fallback; Hindi UI/templates; Marathi templates; downloadable CSV/Excel/PDF reports; cited RAG assistant; Web Push; offline student drafts; region/institution report pages; scheduled monthly reports. |
| ❌ Out of scope | Real DigiLocker/APAAR; custom model training; face/biometric checks; SMS/WhatsApp; public rankings; microservices; native mobile app; Aadhaar verification. |

Four portal shells and institution access are judge-visible; prioritize the AICTE case lifecycle and overlap review before optional polish. Plan's own phase-0 deliverables also call for low-fidelity wireframes for all four portals; add these before declaring Phase 0 complete.

## Synthetic seed specification

Use fictional values only, label every seeded record `DEMO`, and never use real student data.

| Entity | Required seed |
|---|---|
| Institutions | 10 institutions across 3 fictionalized regions; varied types; stable synthetic AICTE IDs. |
| Users | 50 students, 5 faculty, 3 college officers, 4 AICTE officers. Use distinct accounts and realistic role scopes. |
| Complaints | 30 complaints; statuses distributed across intake, referral, examination, closed, and appeal-eligible states; varied categories, urgency, confidentiality, and verification. |
| Alert 1 | 5 cross-Bureau overlap pairs: same institution with active cases assigned to separate Bureaus; each has a coordination alert and explicit expected result. |
| Alert 2 | 3 same-issue/different-wording pairs; include at least one multilingual/wording variation if matcher supports it. Label pair ground truth. |
| Deadlines | 2 overdue cases with due dates before seed time and appropriate deadline status. |
| Management case | At least 1 complaint involving college management; ensure excluded college-management users and notification recipients. |
| Additional edge cases | Include unverified urgent case, recused faculty, dismissed pair, transferred case preserving prior state, one awaiting-response case, and one clean/no-match pair. |

Acceptance accounting: the 5 cross-Bureau pairs and 3 wording pairs may overlap only if deliberately labelled as both alert classes; otherwise make them distinct. The requested 30 cases must leave enough distinct complaint IDs for all eight pair scenarios.

## Ten priority API contracts (Zod-shaped TypeScript; planning reference)

Shared contract conventions: `z.string().uuid()` for IDs, `.datetime()` for timestamps, `.strict()` for request objects, response envelopes `{ data: ..., request_id: uuid }`. Authorization scope comes from the session, never from body-supplied institution/Bureau/role fields. Validation and permission errors use the common error shape above.

```typescript
type CaseCategory = "financial" | "ragging" | "academic" | "infrastructure" | "other";
type LifecycleStatus = "submitted" | "under_triage" | "referred" | "awaiting_response" | "under_examination" | "decision_recorded" | "closed" | "out_of_scope" | "transferred" | "appeal_submitted" | "under_appeal_review" | "appeal_decided";
type CaseSummary = { id: string; case_id: string; institution_id: string; status: string;
  category: CaseCategory; submitted_at: string; assigned_bureau: string | null;
  verification_status: string; urgency_status: string; version: number };
type Page<T> = { items: T[]; next_cursor: string | null };

// 1. POST /api/complaints — student/alumnus submits own case
const SubmitComplaintRequest = z.object({
  category: z.enum(["financial", "ragging", "academic", "infrastructure", "other"]),
  secondary_category: z.string().max(80).optional(),
  description_text: z.string().min(50).max(5000),
  description_language: z.enum(["en", "hi", "mr"]), is_urgent: z.boolean(),
  is_confidential: z.boolean(), evidence_ids: z.array(z.string().uuid()).max(5),
}).strict();
const SubmitComplaintResponse = z.object({ data: CaseSummary, request_id: z.string().uuid() });
// Institution and complainant are derived from session/verified affiliation.

// 2. GET /api/complaints — scoped searchable case list
const ListComplaintsQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(25),
  institution_id: z.string().uuid().optional(), case_id: z.string().max(40).optional(), bureau: z.string().max(80).optional(),
  region: z.string().max(80).optional(), category: z.string().optional(), status: z.string().optional(),
  from: z.string().date().optional(), to: z.string().date().optional() }).strict();
const ListComplaintsResponse = z.object({ data: z.object({ items: z.array(z.any()), next_cursor: z.string().nullable() }), request_id: z.string().uuid() });

// 3. GET /api/complaints/:id — only visible cases; response is role-redacted
const GetComplaintParams = z.object({ id: z.string().uuid() });
const GetComplaintResponse = z.object({ data: z.object({ complaint: z.any(), events: z.array(z.any()), evidence: z.array(z.any()) }), request_id: z.string().uuid() });

// 4. POST /api/complaints/:id/transition — allowed-edge state machine
const TransitionComplaintRequest = z.object({ to: z.enum(["under_triage", "referred", "awaiting_response", "under_examination", "decision_recorded", "closed", "out_of_scope", "transferred", "appeal_submitted", "under_appeal_review", "appeal_decided"]), reason: z.string().min(3).max(1000).optional(),
  expected_version: z.number().int().positive(), next_action: z.string().max(500).optional(), next_action_at: z.string().datetime().optional() }).strict();
const TransitionComplaintResponse = z.object({ data: CaseSummary, request_id: z.string().uuid() });

// 5. POST /api/complaints/:id/assign — PGRC/Bureau Head scope
const AssignComplaintRequest = z.object({ assigned_bureau: z.string().min(1).max(80), assigned_officer: z.string().uuid().nullable(),
  reason: z.string().min(3).max(1000), expected_version: z.number().int().positive() }).strict();
const AssignComplaintResponse = z.object({ data: CaseSummary, request_id: z.string().uuid() });

// 6. POST /api/affiliations — claim affiliation for signed-in user
const CreateAffiliationRequest = z.object({ institution_id: z.string().uuid(), type: z.enum(["current_student", "alumnus", "faculty"]),
  enrollment_no: z.string().max(80).optional(), programme: z.string().max(160).optional(), year: z.string().max(30).optional() }).strict();
const CreateAffiliationResponse = z.object({ data: z.object({ id: z.string().uuid(), status: z.enum(["pending", "verified", "needs_review", "unable_to_verify"]) }), request_id: z.string().uuid() });

// 7. POST /api/affiliations/:id/verify — AICTE verifier only
const VerifyAffiliationRequest = z.object({ outcome: z.enum(["verified", "needs_review", "unable_to_verify"]),
  method: z.enum(["roster", "document", "manual"]), reason: z.string().min(3).max(1000) }).strict();
const VerifyAffiliationResponse = z.object({ data: z.object({ affiliation_id: z.string().uuid(), status: z.string(), reviewed_at: z.string().datetime() }), request_id: z.string().uuid() });

// 8. POST /api/complaints/:id/evidence — issue a private upload slot; finalize after upload/scan
const CreateEvidenceRequest = z.object({ filename: z.string().min(1).max(180), mime_type: z.string().min(1).max(120), size_bytes: z.number().int().positive().max(10 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/i) }).strict();
const CreateEvidenceResponse = z.object({ data: z.object({ evidence_id: z.string().uuid(), upload_url: z.string().url(), expires_at: z.string().datetime() }), request_id: z.string().uuid() });

// 9. GET /api/overlap-alerts — AICTE roles only, scoped to authorization
const ListOverlapAlertsQuery = z.object({ status: z.enum(["open", "linked", "dismissed", "reopened"]).optional(), type: z.enum(["coordination", "related"]).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
const ListOverlapAlertsResponse = z.object({ data: z.object({ items: z.array(z.any()), next_cursor: z.string().nullable() }), request_id: z.string().uuid() });

// 10. POST /api/overlap-alerts/:id/review — link or dismiss; reason mandatory
const ReviewOverlapRequest = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("link"), lead_bureau: z.string().min(1).max(80), reason: z.string().min(3).max(1000) }).strict(),
  z.object({ decision: z.literal("dismiss"), reason: z.string().min(3).max(1000) }).strict(),
]);
const ReviewOverlapResponse = z.object({ data: z.object({ alert_id: z.string().uuid(), status: z.string(), reviewed_at: z.string().datetime() }), request_id: z.string().uuid() });
```

## Remaining API contracts

These complete the MVP-facing endpoints identified in the Phase 0 review. Report generation/export and RAG endpoints are not included because those features are outside the definite MVP. Use the common envelope and error shape above; list endpoints use cursor pagination.

```typescript
// 11. GET /api/institutions/:id — profile and role-redacted consolidated case counts
const InstitutionParams = z.object({ id: z.string().uuid() });
const InstitutionProfileResponse = z.object({ data: z.object({ id: z.string().uuid(), aicte_permanent_id: z.string(), name: z.string(), region: z.string(), type: z.string(), status: z.enum(["active", "inactive"]), case_counts: z.record(z.string(), z.number().int().nonnegative()) }), request_id: z.string().uuid() });

// 12. POST /api/institutions/:id/roster-versions — college management uploads CSV via private signed slot
const CreateRosterVersionRequest = z.object({ filename: z.string().min(1).max(180), size_bytes: z.number().int().positive().max(10 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/i) }).strict();
const CreateRosterVersionResponse = z.object({ data: z.object({ version_id: z.string().uuid(), upload_url: z.string().url(), expires_at: z.string().datetime() }), request_id: z.string().uuid() });
// A separate POST /api/roster-versions/:id/complete accepts { sha256: hex64 } and returns { version_id, status: "processing" | "active" | "rejected", row_count: int }.

// 13. GET /api/complaints/:id/events — role-filtered, redacted timeline
const CaseEventsQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const CaseEventsResponse = z.object({ data: z.object({ items: z.array(z.object({ id: z.string().uuid(), event_type: z.string(), event_at: z.string().datetime(), actor_label: z.string(), summary: z.string(), public_to_complainant: z.boolean() })), next_cursor: z.string().nullable() }), request_id: z.string().uuid() });

// 14. POST /api/complaints/:id/referral — PGRC sends case to institution
const CreateReferralRequest = z.object({ institution_deadline_at: z.string().datetime(), response_scope: z.enum(["response_only", "redacted_summary"]), reason: z.string().min(3).max(1000), expected_version: z.number().int().positive() }).strict();
const CreateReferralResponse = z.object({ data: z.object({ complaint: CaseSummary, referral_event_id: z.string().uuid(), institution_deadline_at: z.string().datetime() }), request_id: z.string().uuid() });

// 15. POST /api/complaints/:id/responses — assigned faculty or college officer response
const SubmitInstitutionResponseRequest = z.object({ response_text: z.string().min(1).max(10000), student_visible_summary: z.string().max(3000).optional(), evidence_ids: z.array(z.string().uuid()).max(5), internal_note: z.string().max(3000).optional(), expected_version: z.number().int().positive() }).strict();
const SubmitInstitutionResponseResponse = z.object({ data: z.object({ response_event_id: z.string().uuid(), complaint: CaseSummary, submitted_at: z.string().datetime() }), request_id: z.string().uuid() });

// 16. POST /api/complaints/:id/appeals — complainant submits if appeal_status is eligible
const SubmitAppealRequest = z.object({ grounds: z.string().min(20).max(5000), evidence_ids: z.array(z.string().uuid()).max(5) }).strict();
const SubmitAppealResponse = z.object({ data: z.object({ appeal_event_id: z.string().uuid(), appeal_status: z.literal("submitted"), submitted_at: z.string().datetime() }), request_id: z.string().uuid() });

// 17. POST /api/complaints/:id/appeal-decision — Ombudsperson only
const AppealDecisionRequest = z.object({ outcome: z.enum(["uphold", "return_for_further_action"]), decision_text: z.string().min(20).max(5000), reason: z.string().min(3).max(1000), expected_version: z.number().int().positive() }).strict();
const AppealDecisionResponse = z.object({ data: z.object({ complaint: CaseSummary, appeal_status: z.literal("decided"), decided_at: z.string().datetime() }), request_id: z.string().uuid() });

// 18. GET /api/deadline-rules — AICTE authorized roles
const DeadlineRulesQuery = z.object({ active_only: z.coerce.boolean().default(true), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const DeadlineRulesResponse = z.object({ data: z.object({ items: z.array(z.object({ id: z.string().uuid(), name: z.string(), route: z.string(), category: z.string().nullable(), days_to_deadline: z.number().int().positive(), source_citation: z.string(), effective_from: z.string().date(), is_active: z.boolean() })), next_cursor: z.string().nullable() }), request_id: z.string().uuid() });

// 18b. POST /api/deadline-rules — authorized AICTE administrator; changes are reasoned and audited
const CreateDeadlineRuleRequest = z.object({ name: z.string().min(1).max(120), route: z.string().min(1).max(80), category: z.enum(["financial", "ragging", "academic", "infrastructure", "other"]).nullable(), days_to_deadline: z.number().int().min(1).max(365), source_citation: z.string().min(1).max(500), effective_from: z.string().date(), reason: z.string().min(3).max(1000) }).strict();
const CreateDeadlineRuleResponse = z.object({ data: z.object({ id: z.string().uuid(), name: z.string(), days_to_deadline: z.number().int(), is_active: z.boolean() }), request_id: z.string().uuid() });

// 19. PUT /api/me/notification-preferences — only the signed-in user's preferences
const NotificationPreferencesRequest = z.object({ preferences: z.array(z.object({ event_type: z.string().min(1).max(80), channel: z.enum(["in_app", "email"]), enabled: z.boolean(), language: z.enum(["en", "hi", "mr"]) }).strict()).max(50) }).strict();
const NotificationPreferencesResponse = z.object({ data: z.object({ preferences: NotificationPreferencesRequest.shape.preferences }), request_id: z.string().uuid() });

// 20. GET /api/dashboard/summary — aggregates are scoped by current role/session
const DashboardSummaryQuery = z.object({ from: z.string().date().optional(), to: z.string().date().optional() }).strict();
const DashboardSummaryResponse = z.object({ data: z.object({ received: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), under_process: z.number().int().nonnegative(), disposed: z.number().int().nonnegative(), transferred: z.number().int().nonnegative(), overdue: z.number().int().nonnegative(), open_overlap_alerts: z.number().int().nonnegative() }), request_id: z.string().uuid() });

// 21. GET /api/reports/cases — scoped report query; downloadable formats remain optional MVP scope
const CaseReportQuery = z.object({ from: z.string().date().optional(), to: z.string().date().optional(), group_by: z.enum(["status", "bureau", "region", "institution", "category"]).default("status"), format: z.enum(["json", "csv"]).default("json") }).strict();
const CaseReportResponse = z.object({ data: z.object({ generated_at: z.string().datetime(), group_by: z.string(), rows: z.array(z.object({ key: z.string(), received: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), disposed: z.number().int().nonnegative(), overdue: z.number().int().nonnegative() })) }), request_id: z.string().uuid() });
```

For implementation speed, roster CSV upload can use a small private local/demo storage adapter first; the contract keeps the eventual signed-upload flow. No paid external API is required by these contracts. Hosting, email delivery, and database free-tier limits depend on the chosen provider and are not guaranteed by the API design.

## As built (routes actually implemented)

The contracts above are the planning reference. The implemented API differs as follows. Responses are plain JSON (no `data`/`request_id` envelope); errors are `{ "error": ... }`.

| Documented | As built |
|---|---|
| `GET /api/overlap-alerts` | `GET /api/overlap/alerts` |
| `POST /api/overlap-alerts/:id/review` (`decision`) | `POST /api/overlap/alerts/:id/link` and `POST /api/overlap/alerts/:id/dismiss` |
| `POST /api/complaints/:id/appeals` | `POST /api/complaints/:id/appeal` (student only, body `{ reason }`) |
| `GET /api/dashboard/summary` | `GET /api/dashboard/kpis` |
| `POST /api/complaints/:id/transition` body `to` / `expected_version` / `reason` | body `to_status` / `version` / `remarks`; `to_status: "escalate"` records an escalation event and keeps the status |
| `POST /api/complaints/:id/assign` body `reason` / `expected_version` | body `assigned_bureau`, `assigned_officer`, `remarks` / `version` |
| `GET /api/complaints` cursor paging | `page` / `limit` paging; filters `case_id`, `bureau`, `category`, `status`, `date_from`, `date_to`, `aicte_id`, `region`, `institution_name` (institution filters use an inner join) |

Status codes: `403` is returned when a record is visible to the caller but the portal rule denies it. Records hidden by row-level security return `404` so their existence is not revealed. Case views are audited (`complaint.viewed`).

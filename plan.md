# NyayaSetu — Completion Plan

Source of truth: `sources/NyayaSetu_ProjectPlan.md` (§4 Phase Breakdown) and `docs/`.
Baseline: commit `abaa586` — typecheck and `next build` pass.
Rules: continue the code base, do not refactor. New migrations go in `supabase/migrations/` only.
Any edit to an existing file must appear in **Part B** and be approved before it is made.
No push to the live Supabase project without asking first.

Status key: ✅ built and committed · ⏭️ deliberately out of scope (plan §12)

**Status 2026-10-25: code complete.** Typecheck clean, lint 0 errors, 27/27 unit tests, `next build` passes.
All 8 migrations replay cleanly on an empty Postgres (local PGlite dry run).
Not yet done (needs the user): push migrations to Supabase (CLI account lacks project access), seed, live/browser testing,
Resend + VAPID keys, an external hourly caller for the two cron routes, official policy corpus, native Hindi review.

---

## Part A — Work by phase

### Phase 0 — Freeze & scaffold
- ✅ Permission matrix, state diagram, MVP list, wireframes, seed design (`docs/`)
- ✅ Schema freeze — two migration sets (`packages/db/migrations` vs `supabase/migrations`) → **B1**
- ✅ API contract — code differs from `docs/mvp-seed-api.md` (routes, envelopes) → **B9**

### Phase 1 — Foundation & access control
- ✅ JWT/session proxy, institution profile, TOTP gate for officers
- ✅ DB trigger computing the `case_events` hash chain + verifier function (new migration)
- ✅ Audit hash chain on `audit_events` (new migration)
- ✅ Role-assignment list endpoint + admin UI page (new files)
- ✅ Case-view auditing, 403 vs 404 → **B6**
- ⏭️ Phone OTP — needs an SMS provider; out of scope per plan §12, keep email only

### Phase 2 — AICTE dashboard & case lifecycle
- ✅ Intake, PS fields, history view, 7 KPI tiles, institution history
- ✅ Deadline rules: seed migration + admin API/page (new)
- ✅ Hourly deadline tracker: `pg_cron` job in a new migration (on_track → nearing → overdue + escalation event)
- ✅ Escalate transition, transfer with prior-bureau capture → **B5**
- ✅ Filters on institution fields may not filter → **B5**

### Phase 3 — Overlap detection & AI matching
- ✅ Local multilingual embeddings (`@huggingface/transformers`, 768-dim) + backfill script
- ✅ 6-factor scoring library (category, cosine, date decay, entities, attachment hash, cross-bureau)
- ✅ Case comparison page `/aicte/alerts/[id]/compare` (side by side, factor rows, highlighted phrases)
- ✅ RLS/grants migration so link/dismiss/alert inserts work
- ✅ Labelled test set (150+ pairs, Appendix B) + precision/recall script
- ✅ Wire new scoring into detection, respect `dismissed_pairs`, run on bureau change → **B3**

### Phase 4 — Feeder portals
- ✅ Picker, complaint form, duplicate check, my cases, thread, feedback, workload, ageing, TOTP
- ✅ Affiliation claim + roster match API/page (new) — students currently cannot file without manual DB data
- ✅ Conflict-of-interest declaration (new table + modal)
- ✅ College committee roster, monthly compliance report page (new)
- ✅ Appeal-eligibility rule (set `eligible` on close) — new trigger migration
- ✅ Recusal reassignment, hearing notifications, roster re-verification, IndexedDB drafts → **B4**

### Phase 5 — Notifications, OCR, multilingual (all missing)
- ✅ Notification policies seed + dispatcher (`lib/notify.ts`), recipient resolution, sensitive-case rule
- ✅ Email via Resend (no-op + logged while `RESEND_API_KEY` is blank), idempotency key
- ✅ In-app bell + `/api/notifications`
- ✅ Web Push (only active once VAPID keys are set)
- ✅ Notification preferences table + page
- ✅ OCR: Tesseract.js client component, confidence colours, Aadhaar redaction, manual fallback, pdf.js for PDFs
- ✅ i18n: `next-intl`, en + hi (mr stretch), language selector
- ✅ Bhashini mock endpoint labelled "Simulated"
- Hooking notifications into existing routes → **B4**

### Phase 6 — Reports, RAG, hardening, demo
- ✅ 8 PS reports page + CSV/Excel (ExcelJS)/PDF export, role-scoped
- ✅ Scheduled monthly report (`pg_cron` → `report_runs`)
- ✅ RAG: corpus folder, chunk+embed script, retrieval API with citations, abstention, procedure-only scope; answers quote passages ("Simulated LLM")
- ✅ Vitest (state machine, scoring, routing) + Playwright demo script + k6 script
- ✅ CSP + HSTS headers → **B7**
- ✅ Demo: auth accounts in seed, `npm run demo:reset`, integration labels
- ⏭️ Malware scan — future work (ClamAV); keep labelled "Future"

### Reproducibility
- ✅ `SETUP.md`, `.nvmrc` (Node 24), root scripts (`seed`, `test`, `demo:reset`), env-var list kept in `.env.example`

---

## Part B — Changes to existing code (approved by user 2026-10-24: B1–B10)

| # | Severity | Change | Files |
|---|---|---|---|
| B1 | High | Treat `supabase/migrations` as the only authority; mark `packages/db/migrations` as legacy (README note only, no deletion) | `packages/db/README.md` |
| B2 | **Critical** | Remove the dev OTP fallback: route returns a working login code (`devOtp`) to any caller and logs it; login form puts it in the URL | `api/auth/otp/route.ts`, `components/auth/login-form.tsx` |
| B3 | High | Overlap detection: use the new 6-factor score, read `dismissed_pairs`, stop recreating dismissed alerts, stop Alert 2 firing on category+date alone, run on bureau change | `api/overlap/detect/route.ts`, `api/complaints/[id]/assign/route.ts` |
| B4 | Medium | Hook notifications into existing routes (transition, assign, hearings, recuse, roster upload re-verification, feedback/appeal); IndexedDB drafts | the matching `api/**/route.ts`, `complaint-form.tsx` |
| B5 | Medium | State machine: add escalate + transfer prior-bureau; fix institution filters with `!inner` | `lib/state-machine.ts`, `api/complaints/route.ts` |
| B6 | Medium | Audit case views; return 403 (not 404) on denials; check event-insert errors; stop swallowing audit failures | `api/complaints/[id]/route.ts`, `events/route.ts`, `transition/route.ts`, `assign/route.ts` |
| B6b | Medium | Routes stop computing `event_hash` themselves (their `|`-separated format differs) and let the new DB trigger do it, so `verify_case_event_chain` works | `transition`, `assign`, `events`, `appeal` routes |
| B7 | Low | Add CSP + HSTS | `next.config.ts` |
| B8 | Low | Service worker caches an authenticated page; switch to drafts-only | `public/sw.js` |
| B9 | Low | Update `docs/mvp-seed-api.md` to match the routes as built (docs only, no code change) | `docs/mvp-seed-api.md` |
| B10 | Low | Add nav links to new pages in existing layouts/home | `components/portal-home.tsx`, portal pages |

| B11 | Medium | **Approved 2026-10-24.** `complaints_student_insert` RLS requires a *verified* affiliation, but plan §3.3 says unverified students may still file (held at AICTE triage, never auto-forwarded). Needs a new migration replacing that policy | new migration (replaces existing policy) |

---

## Execution order (Haiku agents, one per row, commit after each)
1. Phase 1+2 DB: hash-chain trigger, RLS/grants fixes, deadline rules seed, `pg_cron` jobs (new migration files only)
2. Phase 3: embeddings, scoring lib, compare page, test set, P/R script
3. Phase 4: affiliation + roster match, COI, committee, compliance report, appeal eligibility
4. Phase 5: notifications, OCR, i18n, Bhashini mock
5. Phase 6: reports, RAG, tests, demo reset
6. Approved Part B items
7. `SETUP.md`, typecheck, build, tests; ask before `supabase db push`

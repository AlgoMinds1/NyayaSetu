// Seed script — run with: node --env-file=.env.local src/scripts/seed.mjs
// Inserts 10 institutions, 6 demo auth users (no passwords), 32 complaints, and overlap scenarios. Idempotent: safe to re-run.
// All records have is_demo=true (where applicable) and display "DEMO" in the UI.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── 1. Institutions ───────────────────────────────────────────────────────────
const INSTITUTIONS = [
  { aicte_permanent_id: "AP-2001-0001", name: "Apex Institute of Technology",      region: "North",      type: "Engineering", status: "active" },
  { aicte_permanent_id: "AP-2001-0002", name: "Greenfield College of Engineering", region: "North",      type: "Engineering", status: "active" },
  { aicte_permanent_id: "AP-2001-0003", name: "Southern Polytechnic University",   region: "South-West", type: "Polytechnic",  status: "active" },
  { aicte_permanent_id: "AP-2001-0004", name: "East Coast Management Institute",   region: "East",       type: "Management",  status: "active" },
  { aicte_permanent_id: "AP-2001-0005", name: "Coastal School of Architecture",    region: "South-West", type: "Architecture", status: "active" },
  { aicte_permanent_id: "AP-2001-0006", name: "North Star Technical College",      region: "North",      type: "Engineering", status: "active" },
  { aicte_permanent_id: "AP-2001-0007", name: "Horizon Institute of Pharmacy",     region: "East",       type: "Pharmacy",    status: "active" },
  { aicte_permanent_id: "AP-2001-0008", name: "Sunrise MBA College",               region: "South-West", type: "Management",  status: "active" },
  { aicte_permanent_id: "AP-2001-0009", name: "Valley Engineering College",        region: "North",      type: "Engineering", status: "inactive" },
  { aicte_permanent_id: "AP-2001-0010", name: "Delta Institute of Technology",     region: "East",       type: "Engineering", status: "active" },
];

// ── 2. Demo users ─────────────────────────────────────────────────────────────
// Six demo roles. Each is a real Supabase Auth user (email_confirm, no password: sign-in is by email OTP).
// The users row is created by the auth trigger; role_assignments link each persona to its scope.
const DEMO_PERSONAS = [
  { key: "student",  display_name: "Demo Student",          role: "student",              institution: "AP-2001-0001" },
  { key: "faculty",  display_name: "Demo Faculty",          role: "faculty",              institution: "AP-2001-0001" },
  { key: "college",  display_name: "Demo College Officer",  role: "college_management",   institution: "AP-2001-0001" },
  { key: "pgrc",     display_name: "Demo PGRC Officer",     role: "pgrc_triage_officer",  bureau: "PGRC" },
  { key: "rb",       display_name: "Demo RB Officer",       role: "bureau_officer",       bureau: "RB" },
  { key: "mgmt",     display_name: "Demo Senior Management", role: "competent_authority" },
];

/** Returns the auth user id for an email, creating the user only when it does not exist. Idempotent. */
async function ensureAuthUser(email, displayName) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { display_name: displayName, demo: true },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

async function seed() {
  console.log("🌱 Seeding NyayaSetu demo data...\n");

  // 1. Institutions
  console.log("📍 Inserting institutions...");
  const { data: instData, error: instErr } = await supabase
    .from("institutions")
    .upsert(INSTITUTIONS, { onConflict: "aicte_permanent_id" })
    .select("id, aicte_permanent_id, name");
  if (instErr) { console.error("Institution error:", instErr); process.exit(1); }
  console.log(`   ✅ ${instData.length} institutions`);

  const instMap = Object.fromEntries(instData.map(i => [i.aicte_permanent_id, i.id]));
  const apex    = instMap["AP-2001-0001"];
  const green   = instMap["AP-2001-0002"];
  const south   = instMap["AP-2001-0003"];
  const east    = instMap["AP-2001-0004"];

  // 2. Demo auth users (idempotent: existing emails are reused)
  console.log("👤 Ensuring demo auth users...");
  const personaIds = {};
  for (const p of DEMO_PERSONAS) {
    const email = `${p.key}.demo@nyayasetu.test`;
    personaIds[p.key] = await ensureAuthUser(email, p.display_name);
    await supabase.from("users").upsert(
      { id: personaIds[p.key], email, display_name: p.display_name, is_active: true },
      { onConflict: "id" }
    );
  }
  console.log(`   ✅ ${DEMO_PERSONAS.length} demo users (sign in by email OTP)`);

  const pgrcId    = personaIds.pgrc;
  const rbId      = personaIds.rb;
  const studentId = personaIds.student;

  // 3. Role assignments: one active assignment per user (unique index), so each persona is cleared then re-granted.
  console.log("🔐 Inserting role assignments...");
  const roleAssignments = DEMO_PERSONAS.map((p) => ({
    user_id: personaIds[p.key], role: p.role,
    institution_id: p.institution ? instMap[p.institution] : null,
    bureau: p.bureau ?? null,
    granted_by: rbId, reason: "DEMO seed",
  }));
  await supabase.from("role_assignments").delete().in("user_id", roleAssignments.map(r => r.user_id));
  const { error: roleErr } = await supabase.from("role_assignments").insert(roleAssignments);
  if (roleErr) { console.error("Role insert error:", roleErr); process.exit(1); }
  console.log(`   ✅ ${roleAssignments.length} role assignments`);

  // 4. Complaints — 30 records across lifecycle states
  console.log("📋 Inserting complaints...");
  const now = new Date();
  const daysAgo = (d) => new Date(now - d * 86400000).toISOString().slice(0,10);

  const complaints = [
    // === Normal lifecycle cases ===
    { case_id:"NS-2026-00001", institution_id:apex,  submitted_by:studentId, category:"financial",       status:"under_triage",        assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(2),  description_text:"Student fee refund not processed for 3 months despite repeated requests to accounts department.", urgency_status:"triaged" },
    { case_id:"NS-2026-00002", institution_id:apex,  submitted_by:studentId, category:"academic",        status:"referred",             assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(5),  description_text:"Examination results withheld without valid reason for the semester ending June 2026.", urgency_status:"triaged" },
    { case_id:"NS-2026-00003", institution_id:apex,  submitted_by:studentId, category:"infrastructure",  status:"awaiting_response",    assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(12), description_text:"Laboratory equipment broken and not replaced for over 6 months. Students unable to complete practical work." },
    { case_id:"NS-2026-00004", institution_id:green, submitted_by:studentId, category:"financial",       status:"under_examination",    assigned_bureau:"RB",   assigned_officer:rbId,   receipt_date:daysAgo(18), description_text:"Caution deposit of Rs 25000 not refunded 8 months after course completion.", urgency_status:"triaged" },
    { case_id:"NS-2026-00005", institution_id:green, submitted_by:studentId, category:"ragging",         status:"under_examination",    assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(3),  description_text:"Ragging incident in hostel block B reported on 21 Oct 2026.", urgency_status:"urgent", is_confidential:true },
    { case_id:"NS-2026-00006", institution_id:south, submitted_by:studentId, category:"academic",        status:"decision_recorded",    assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(30), description_text:"Biased internal assessment marks given by faculty member without justification." },
    { case_id:"NS-2026-00007", institution_id:south, submitted_by:studentId, category:"financial",       status:"closed",               assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(45), description_text:"Scholarship amount not disbursed for academic year 2025-26." },
    { case_id:"NS-2026-00008", institution_id:east,  submitted_by:studentId, category:"infrastructure",  status:"submitted",            receipt_date:daysAgo(1),  description_text:"No accessible ramp or elevator available for students with physical disabilities." },
    { case_id:"NS-2026-00009", institution_id:east,  submitted_by:studentId, category:"other",           status:"out_of_scope",         assigned_bureau:"PGRC", receipt_date:daysAgo(20), description_text:"Request for change in examination timetable." },
    { case_id:"NS-2026-00010", institution_id:apex,  submitted_by:studentId, category:"academic",        status:"transferred",          assigned_bureau:"RB",   receipt_date:daysAgo(8),  description_text:"Faculty member absent for 12 consecutive classes without replacement." },
    // === Overdue cases ===
    { case_id:"NS-2026-00011", institution_id:apex,  submitted_by:studentId, category:"financial",       status:"awaiting_response",    assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(35), deadline_status:"overdue",  expected_disposal_at:daysAgo(14), description_text:"Refund pending since March 2026. College not responding to repeated communications." },
    { case_id:"NS-2026-00012", institution_id:green, submitted_by:studentId, category:"academic",        status:"under_examination",    assigned_bureau:"RB",   assigned_officer:rbId,   receipt_date:daysAgo(40), deadline_status:"overdue",  expected_disposal_at:daysAgo(19), description_text:"PhD admission process violation — committee constitution not per UGC norms." },
    { case_id:"NS-2026-00013", institution_id:south, submitted_by:studentId, category:"infrastructure",  status:"referred",             assigned_bureau:"PGRC", receipt_date:daysAgo(28), deadline_status:"nearing", expected_disposal_at:daysAgo(-3), description_text:"Fire safety certificates expired 6 months ago. No remedial action taken." },
    // === OVERLAP SCENARIO 1: Same institution (Apex), cross-bureau, different issues ===
    // PGRC has a fee case; RB has a regulatory inspection case — triggers Alert 1
    { case_id:"NS-2026-00014", institution_id:apex,  submitted_by:studentId, category:"financial",       status:"under_triage",         assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(4),  description_text:"Excessive fee collected beyond AICTE approved fee structure for batch 2024.", coordination_status:"possible_overlap" },
    { case_id:"NS-2026-00015", institution_id:apex,  submitted_by:pgrcId,    category:"academic",        status:"under_examination",    assigned_bureau:"RB",   assigned_officer:rbId,   receipt_date:daysAgo(6),  description_text:"Regulatory inspection initiated: Faculty shortage and infrastructure non-compliance at Apex Institute.", coordination_status:"possible_overlap" },
    // === OVERLAP SCENARIO 2: Same institution (Green), same fee issue, different wording — triggers both Alert 1 and Alert 2 ===
    { case_id:"NS-2026-00016", institution_id:green, submitted_by:studentId, category:"financial",       status:"under_triage",         assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(7),  description_text:"College charged hostel fee of Rs 85000 which is not approved by AICTE.", coordination_status:"possible_overlap" },
    { case_id:"NS-2026-00017", institution_id:green, submitted_by:pgrcId,    category:"financial",       status:"under_examination",    assigned_bureau:"RB",   assigned_officer:rbId,   receipt_date:daysAgo(9),  description_text:"Unapproved hostel charges levied on students contrary to approved fee schedule from AICTE.", coordination_status:"possible_overlap" },
    // === OVERLAP SCENARIO 3: Management-involved case ===
    { case_id:"NS-2026-00018", institution_id:apex,  submitted_by:studentId, category:"academic",        status:"under_triage",         assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(2),  description_text:"Principal pressuring students to withdraw complaints. Direct intimidation reported.", involves_management:true, is_confidential:true, urgency_status:"urgent" },
    // === Additional variety ===
    { case_id:"NS-2026-00019", institution_id:instMap["AP-2001-0005"], submitted_by:studentId, category:"infrastructure", status:"referred",          assigned_bureau:"PGRC", receipt_date:daysAgo(11), description_text:"Building construction ongoing during academic sessions violating safety norms." },
    { case_id:"NS-2026-00020", institution_id:instMap["AP-2001-0006"], submitted_by:studentId, category:"financial",      status:"under_triage",       assigned_bureau:"PGRC", receipt_date:daysAgo(1),  description_text:"Exam fee collected twice without refund of duplicate payment." },
    { case_id:"NS-2026-00021", institution_id:instMap["AP-2001-0007"], submitted_by:studentId, category:"academic",       status:"closed",             assigned_bureau:"PGRC", receipt_date:daysAgo(60), description_text:"Practical examiner not qualified as per PCI norms." },
    { case_id:"NS-2026-00022", institution_id:instMap["AP-2001-0008"], submitted_by:studentId, category:"other",          status:"under_examination",  assigned_bureau:"RB",   receipt_date:daysAgo(15), description_text:"Affiliation renewal documents submitted with incorrect data." },
    { case_id:"NS-2026-00023", institution_id:east,  submitted_by:studentId, category:"ragging",         status:"under_examination",    assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(5),  description_text:"Senior students engaging in verbal abuse and forced labour from juniors.", urgency_status:"urgent", is_confidential:true },
    { case_id:"NS-2026-00024", institution_id:instMap["AP-2001-0009"], submitted_by:studentId, category:"academic",      status:"submitted",           receipt_date:daysAgo(0),  description_text:"Examination conducted without prior notice in violation of academic calendar." },
    { case_id:"NS-2026-00025", institution_id:instMap["AP-2001-0010"], submitted_by:studentId, category:"financial",     status:"decision_recorded",   assigned_bureau:"PGRC", receipt_date:daysAgo(55), description_text:"Development fee not refunded to students who did not avail hostel facility." },
    { case_id:"NS-2026-00026", institution_id:apex,  submitted_by:studentId, category:"academic",        status:"appeal_submitted",     assigned_bureau:"PGRC", receipt_date:daysAgo(70), description_text:"Dissatisfied with decision on examination malpractice charge. Seeking appeal.", appeal_status:"submitted" },
    { case_id:"NS-2026-00027", institution_id:green, submitted_by:studentId, category:"infrastructure",  status:"closed",               assigned_bureau:"PGRC", receipt_date:daysAgo(90), description_text:"Internet connectivity in library non-functional for 4 months." },
    { case_id:"NS-2026-00028", institution_id:south, submitted_by:studentId, category:"financial",       status:"under_triage",         assigned_bureau:"PGRC", receipt_date:daysAgo(3),  description_text:"Transport bus fees increased by 40% mid-semester without AICTE approval." },
    { case_id:"NS-2026-00029", institution_id:east,  submitted_by:studentId, category:"academic",        status:"referred",             assigned_bureau:"PGRC", receipt_date:daysAgo(14), description_text:"Guest faculty teaching core subjects for entire semester violating AICTE faculty norms." },
    { case_id:"NS-2026-00030", institution_id:instMap["AP-2001-0010"], submitted_by:studentId, category:"other",        status:"out_of_scope",         assigned_bureau:"PGRC", receipt_date:daysAgo(25), description_text:"Request to change course branch after admission." },
    // === DEMO SCENARIO (plan §11): Apex fee pair. Same category, same week, matching wording. Drives the related alert.
    { case_id:"NS-2026-00101", institution_id:apex, submitted_by:studentId, category:"financial", status:"under_triage", assigned_bureau:"PGRC", assigned_officer:pgrcId, receipt_date:daysAgo(4), urgency_status:"triaged", description_text:"Hostel fee of Rs 12000 was charged twice this semester and the duplicate payment refund has not been processed after two written requests." },
    { case_id:"NS-2026-00102", institution_id:apex, submitted_by:studentId, category:"financial", status:"under_examination", assigned_bureau:"RB", assigned_officer:rbId, receipt_date:daysAgo(4), urgency_status:"triaged", description_text:"Hostel fee charged twice this semester; the duplicate payment has not been refunded despite written requests to the accounts office." },
  ].map(c => ({
    status:                "submitted",
    verification_status:   "pending",
    coordination_status:   "no_overlap",
    deadline_status:       "on_track",
    appeal_status:         "not_applicable",
    urgency_status:        "untriaged",
    is_confidential:       false,
    involves_management:   false,
    is_demo:               true,
    description_language:  "en",
    ...c,
  }));

  const { error: compErr } = await supabase.from("complaints").upsert(complaints, { onConflict: "case_id" });
  if (compErr) { console.error("Complaints error:", compErr); process.exit(1); }
  console.log(`   ✅ ${complaints.length} complaints`);

  // 5. Seed overlap alerts for scenarios 1 and 2
  console.log("🔔 Seeding overlap alerts...");
  const { data: c14 } = await supabase.from("complaints").select("id").eq("case_id","NS-2026-00014").single();
  const { data: c15 } = await supabase.from("complaints").select("id").eq("case_id","NS-2026-00015").single();
  const { data: c16 } = await supabase.from("complaints").select("id").eq("case_id","NS-2026-00016").single();
  const { data: c17 } = await supabase.from("complaints").select("id").eq("case_id","NS-2026-00017").single();
  const { data: c101 } = await supabase.from("complaints").select("id").eq("case_id","NS-2026-00101").single();
  const { data: c102 } = await supabase.from("complaints").select("id").eq("case_id","NS-2026-00102").single();

  // Idempotent: an alert with the same institution, type and complaint pair is left alone.
  async function ensureAlert(institutionId, alertType, a, b, matchFactors) {
    const ids = [a.id, b.id].sort();
    const { data: existing } = await supabase.from("overlap_alerts").select("id")
      .eq("institution_id", institutionId).eq("alert_type", alertType).contains("complaint_ids", ids);
    if (existing?.length) return;
    const { error } = await supabase.from("overlap_alerts").insert({
      institution_id: institutionId, alert_type: alertType, status: "open", complaint_ids: ids, match_factors: matchFactors,
    });
    if (error) console.error("Alert insert error:", error.message);
  }

  if (c14 && c15) {
    await ensureAlert(apex, "coordination", c14, c15,
      { same_institution: true, different_bureaus: ["PGRC","RB"], note: "DEMO: Cross-bureau coordination scenario" });
  }
  if (c16 && c17) {
    await ensureAlert(green, "coordination", c16, c17,
      { same_institution: true, different_bureaus: ["PGRC","RB"], same_category: "financial", note: "DEMO: Same issue different wording — triggers both alerts" });
    await ensureAlert(green, "related", c16, c17,
      { category_match: 1, text_similarity: 0.81, date_proximity: 0.9, different_bureaus: true, match_strength: 0.87 });
  }
  // Apex §11 scenario: Alert 2 on the matching fee pair (same category, same dates, 81% embedding similarity, DEMO values).
  if (c101 && c102) {
    await ensureAlert(apex, "related", c101, c102,
      { category_match: 1, text_similarity: 0.81, date_proximity: 1, different_bureaus: true, match_strength: 0.87, note: "DEMO: Apex fee pair (plan section 11)" });
  }

  console.log("   ✅ Overlap alerts seeded");
  console.log("\n🎉 Seed complete! All records are marked is_demo=true.\n");
  console.log("Demo accounts (sign in with email OTP; no passwords):");
  DEMO_PERSONAS.forEach(p => console.log(`  ${p.display_name.padEnd(26)} ${p.role.padEnd(22)} ${p.key}.demo@nyayasetu.test`));
}

seed().catch(console.error);

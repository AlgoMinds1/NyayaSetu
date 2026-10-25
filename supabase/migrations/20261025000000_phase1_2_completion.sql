-- NyayaSetu Phase 1 + Phase 2 completion. Additive and idempotent; builds on 20261024000000_phase1_foundation.sql.
-- Run only after reviewing docs/schema.md and linking the intended Supabase project.

-- ---------------------------------------------------------------------------
-- 1. case_events hash chain enforced in the database
-- ---------------------------------------------------------------------------
-- Chain is per complaint. App-computed hashes (event_hash supplied on insert) are left untouched.
-- sha256(bytea) is built into Postgres 11+, so no pgcrypto call is needed.

create or replace function public.case_events_hash_chain()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare last_hash text;
begin
  if new.event_hash is not null then return new; end if;
  -- Serialise chain writers per complaint. Two-key form keeps this namespace apart from other advisory locks.
  perform pg_advisory_xact_lock(hashtext('case_events'), hashtext(new.complaint_id::text));
  select ce.event_hash into last_hash from public.case_events ce
    where ce.complaint_id = new.complaint_id and ce.event_hash is not null
    order by ce.event_at desc, ce.id desc limit 1;
  new.prev_event_hash := last_hash;
  new.event_hash := encode(sha256(convert_to(
    coalesce(last_hash,'') || new.event_type || coalesce(new.actor_id::text,'') || new.event_at::text || coalesce(new.new_state::text,''),
    'UTF8')), 'hex');
  return new;
end;
$$;

drop trigger if exists case_events_hash_chain on public.case_events;
create trigger case_events_hash_chain before insert on public.case_events
  for each row execute function public.case_events_hash_chain();

-- Returns the id of the first event whose link or hash does not verify, or null when the chain is intact.
-- Server-only: the function runs as its owner so it can read the full chain regardless of RLS.
create or replace function public.verify_case_event_chain(p_complaint_id uuid)
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r record; prev text := null; calc text;
begin
  for r in select ce.* from public.case_events ce where ce.complaint_id = p_complaint_id order by ce.event_at, ce.id loop
    if r.prev_event_hash is distinct from prev then return r.id; end if;
    calc := encode(sha256(convert_to(
      coalesce(prev,'') || r.event_type || coalesce(r.actor_id::text,'') || r.event_at::text || coalesce(r.new_state::text,''),
      'UTF8')), 'hex');
    if r.event_hash is distinct from calc then return r.id; end if;
    prev := r.event_hash;
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. audit_events hash chain (global chain; legacy rows with null hash are skipped)
-- ---------------------------------------------------------------------------
alter table public.audit_events add column if not exists prev_hash text;
alter table public.audit_events add column if not exists event_hash text;

create or replace function public.audit_events_hash_chain()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare last_hash text;
begin
  if new.event_hash is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('audit_events'), 0);
  select ae.event_hash into last_hash from public.audit_events ae
    where ae.event_hash is not null
    order by ae.event_at desc, ae.id desc limit 1;
  new.prev_hash := last_hash;
  new.event_hash := encode(sha256(convert_to(
    coalesce(last_hash,'') || new.action || coalesce(new.actor_id::text,'') || new.event_at::text
      || new.resource_type || coalesce(new.resource_id::text,'') || coalesce(new.new_value::text,''),
    'UTF8')), 'hex');
  return new;
end;
$$;

drop trigger if exists audit_events_hash_chain on public.audit_events;
create trigger audit_events_hash_chain before insert on public.audit_events
  for each row execute function public.audit_events_hash_chain();

create or replace function public.verify_audit_event_chain()
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r record; prev text := null; calc text;
begin
  for r in select ae.* from public.audit_events ae where ae.event_hash is not null order by ae.event_at, ae.id loop
    if r.prev_hash is distinct from prev then return r.id; end if;
    calc := encode(sha256(convert_to(
      coalesce(prev,'') || r.action || coalesce(r.actor_id::text,'') || r.event_at::text
        || r.resource_type || coalesce(r.resource_id::text,'') || coalesce(r.new_value::text,''),
      'UTF8')), 'hex');
    if r.event_hash is distinct from calc then return r.id; end if;
    prev := r.event_hash;
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Default deadline rules (configurable defaults from packages/db/migrations/009_deadlines.sql, not official AICTE rules)
-- ---------------------------------------------------------------------------
insert into public.deadline_rules(name,route,category,days_to_deadline,source_citation,effective_from,is_active)
select 'College referral response','college_referral',null::public.case_category,15,
  'UGC 2023 student grievance regulations (pattern) — configurable default, not an official AICTE rule',current_date,true
where not exists(select 1 from public.deadline_rules where route='college_referral' and name='College referral response');

insert into public.deadline_rules(name,route,category,days_to_deadline,source_citation,effective_from,is_active)
select 'Standard resolution','standard',null::public.case_category,21,
  'CPGRAMS 21-day target (pattern) — configurable default, not an official AICTE rule',current_date,true
where not exists(select 1 from public.deadline_rules where route='standard' and name='Standard resolution');

insert into public.deadline_rules(name,route,category,days_to_deadline,source_citation,effective_from,is_active)
select 'Appeal decision','appeal',null::public.case_category,30,
  'CPGRAMS appellate pattern — configurable default, not an official AICTE rule',current_date,true
where not exists(select 1 from public.deadline_rules where route='appeal' and name='Appeal decision');

-- ---------------------------------------------------------------------------
-- 4. Officer write access for overlap detection (AICTE officers = pgrc_triage_officer / bureau_head,
--    the same roles the existing overlap_alerts, case_links and dismissed_pairs policies use)
-- ---------------------------------------------------------------------------
drop policy if exists overlap_alerts_ai_insert on public.overlap_alerts;
create policy overlap_alerts_ai_insert on public.overlap_alerts for insert to authenticated
  with check(public.has_any_role(array['pgrc_triage_officer','bureau_head']::public.app_role[]));

drop policy if exists dismissed_pairs_ai_insert on public.dismissed_pairs;
create policy dismissed_pairs_ai_insert on public.dismissed_pairs for insert to authenticated
  with check(dismissed_by=auth.uid() and public.has_any_role(array['pgrc_triage_officer','bureau_head']::public.app_role[]));

grant insert on public.overlap_alerts, public.case_links, public.dismissed_pairs to authenticated;
-- Column-level update: officers may change review state only, not the matched complaint set.
grant update (status, reviewed_by, reviewed_at, review_reason, reopened_by, reopened_at) on public.overlap_alerts to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Hourly deadline tracker
-- ---------------------------------------------------------------------------
-- Status for a deadline at p_now. Window starts at p_start (submitted_at). Nearing when the time left is
-- within the larger of 20% of the window or 2 days. Overdue once the due time has passed.
create or replace function public.deadline_state(p_now timestamptz, p_due timestamptz, p_start timestamptz)
returns public.deadline_status language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_now >= p_due then 'overdue'::public.deadline_status
    when p_due - p_now <= greatest((p_due - p_start) * 0.2::float8, interval '2 days') then 'nearing'::public.deadline_status
    else 'on_track'::public.deadline_status
  end
$$;

-- Open cases only. Paused deadlines are left alone. A case gets one 'status_transition' event (actor_role 'system')
-- the first time it becomes overdue; later runs see it already overdue and do not repeat the event.
create or replace function public.refresh_deadline_status()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; computed public.deadline_status; changed integer := 0;
begin
  for r in
    select c.id, c.submitted_at, c.expected_disposal_at, c.deadline_status
    from public.complaints c
    where c.expected_disposal_at is not null
      and c.status not in ('closed','out_of_scope','appeal_decided')
      and c.deadline_status <> 'paused'
  loop
    computed := public.deadline_state(now(), r.expected_disposal_at, r.submitted_at);
    if computed is distinct from r.deadline_status then
      update public.complaints set deadline_status = computed where id = r.id;
      changed := changed + 1;
      if computed = 'overdue' then
        insert into public.case_events(complaint_id,event_type,actor_id,actor_role,old_state,new_state,remarks,visibility)
        values(r.id,'status_transition',null,'system',
          jsonb_build_object('deadline_status', r.deadline_status),
          jsonb_build_object('deadline_status','overdue'),
          'Expected disposal date passed; case marked overdue by deadline tracker.','internal');
      end if;
    end if;
  end loop;

  update public.deadlines d set status = public.deadline_state(now(), d.due_at, c.submitted_at), last_checked_at = now()
  from public.complaints c
  where c.id = d.complaint_id
    and d.status <> 'paused'
    and c.status not in ('closed','out_of_scope','appeal_decided');

  return changed;
end;
$$;

revoke all on function public.refresh_deadline_status() from public, anon, authenticated;
revoke all on function public.verify_case_event_chain(uuid) from public, anon, authenticated;
revoke all on function public.verify_audit_event_chain() from public, anon, authenticated;
grant execute on function public.verify_case_event_chain(uuid) to service_role;
grant execute on function public.verify_audit_event_chain() to service_role;

create extension if not exists pg_cron;
do $$
begin
  if exists(select 1 from cron.job where jobname = 'nyayasetu-deadline-tracker') then
    perform cron.unschedule('nyayasetu-deadline-tracker');
  end if;
  perform cron.schedule('nyayasetu-deadline-tracker', '0 * * * *', 'select public.refresh_deadline_status()');
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Appeal eligibility on closure
-- ---------------------------------------------------------------------------
-- Appeal window is 30 days from closure. complaints has no closed_at column, so the window is not stored or
-- enforced here; eligibility is granted at the moment of closure, which is inside the window by definition.
create or replace function public.complaints_appeal_eligibility()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare appeal_window constant interval := interval '30 days';  -- allowed appeal window after closure
begin
  if new.status = 'closed' and old.status is distinct from 'closed'
     and (new.appeal_status is null or new.appeal_status = 'not_applicable') then
    new.appeal_status := 'eligible';
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_appeal_eligibility on public.complaints;
create trigger complaints_appeal_eligibility before update of status on public.complaints
  for each row when (new.status = 'closed' and old.status is distinct from new.status)
  execute function public.complaints_appeal_eligibility();

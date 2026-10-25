-- Phase 4 completion: conflict-of-interest declarations, college committee roster, roster claim ownership.
-- Idempotent. Writes go through server routes using the service role after session checks; RLS limits reads.

alter table public.roster_rows add column if not exists claimed_by uuid references public.users(id) on delete restrict;

create table if not exists public.conflict_declarations (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  has_conflict boolean not null,
  reason text check(reason is null or char_length(reason) <= 1000),
  declared_at timestamptz not null default now(),
  unique(complaint_id,user_id),
  check(not has_conflict or (reason is not null and char_length(trim(reason)) >= 10))
);
alter table public.conflict_declarations enable row level security;
drop policy if exists conflict_declarations_self_read on public.conflict_declarations;
create policy conflict_declarations_self_read on public.conflict_declarations for select to authenticated using(
  user_id=auth.uid() or public.has_any_role(array['pgrc_triage_officer','bureau_head']::public.app_role[])
);

create table if not exists public.college_committee_members (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete restrict,
  user_id uuid references public.users(id) on delete restrict,
  name text not null check(char_length(trim(name)) between 2 and 120),
  role text not null check(role in ('chair','member','secretary','nominee')),
  effective_from date not null default current_date,
  effective_to date,
  added_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check(effective_to is null or effective_to >= effective_from)
);
create index if not exists college_committee_members_institution_idx on public.college_committee_members(institution_id,effective_to);
alter table public.college_committee_members enable row level security;
drop policy if exists committee_members_college_read on public.college_committee_members;
create policy committee_members_college_read on public.college_committee_members for select to authenticated using(
  exists(select 1 from public.role_assignments ra join public.users u on u.id=ra.user_id and u.is_active
    where ra.user_id=auth.uid() and ra.revoked_at is null and ra.role in ('college_management','system_admin')
      and (ra.institution_id=college_committee_members.institution_id or ra.role='system_admin') and auth.jwt()->>'aal'='aal2')
);

revoke insert,update,delete,truncate on public.conflict_declarations, public.college_committee_members from anon,authenticated;
grant select on public.conflict_declarations, public.college_committee_members to authenticated;

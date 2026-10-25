-- Phase 5 notifications: push channel, rendered message columns, preferences, push subscriptions, policy seed.
-- Idempotent. Writes from the app go through server routes; self-only RLS limits direct reads.

alter table public.notification_policies drop constraint if exists notification_policies_channel_check;
alter table public.notification_policies add constraint notification_policies_channel_check check (channel in ('in_app','email','push'));
alter table public.notifications drop constraint if exists notifications_channel_check;
alter table public.notifications add constraint notifications_channel_check check (channel in ('in_app','email','push'));

alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists body text;
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists locale text not null default 'en';
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

create unique index if not exists notification_policies_event_role_channel_key on public.notification_policies(event_type, recipient_role, channel);

insert into public.notification_policies(event_type, recipient_role, channel, template_key, restricted_case_rule)
select v.event_type, v.recipient_role::public.app_role, ch.channel, v.event_type,
       case when v.recipient_role in ('college_management','faculty') then 'no_management_or_confidential' else 'none' end
from (values
  ('status_changed','student'),
  ('referred_to_college','college_management'),
  ('hearing_scheduled','student'),
  ('hearing_scheduled','faculty'),
  ('deadline_nearing','pgrc_triage_officer'),
  ('deadline_nearing','bureau_officer'),
  ('deadline_nearing','bureau_head'),
  ('deadline_nearing','college_management'),
  ('deadline_overdue','pgrc_triage_officer'),
  ('deadline_overdue','bureau_officer'),
  ('deadline_overdue','bureau_head'),
  ('deadline_overdue','college_management'),
  ('decision_recorded','student'),
  ('decision_recorded','bureau_head'),
  ('appeal_submitted','ombudsperson'),
  ('appeal_submitted','bureau_head'),
  ('reassignment_needed','pgrc_triage_officer'),
  ('reassignment_needed','bureau_head'),
  ('case_message','student'),
  ('case_message','faculty'),
  ('case_message','college_management'),
  ('case_message','bureau_officer'),
  ('case_assigned','bureau_officer'),
  ('feedback_received','bureau_officer'),
  ('feedback_received','bureau_head')
) as v(event_type, recipient_role)
cross join (values ('in_app'),('email'),('push')) as ch(channel)
on conflict (event_type, recipient_role, channel) do nothing;

create table if not exists public.notification_preferences (
  user_id uuid not null references public.users(id) on delete restrict,
  event_type text not null,
  channel text not null check(channel in ('in_app','email','push')),
  enabled boolean not null default true,
  language text not null default 'en' check(language in ('en','hi','mr')),
  updated_at timestamptz not null default now(),
  primary key(user_id, event_type, channel)
);
alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_self on public.notification_preferences;
create policy notification_preferences_self on public.notification_preferences for all to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  endpoint text not null unique check(char_length(endpoint) <= 2048),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_self on public.push_subscriptions;
create policy push_subscriptions_self on public.push_subscriptions for all to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());

revoke all on public.notification_preferences, public.push_subscriptions from anon;
grant select, insert, update, delete on public.notification_preferences, public.push_subscriptions to authenticated;

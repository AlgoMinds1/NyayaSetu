-- Phase 6: scheduled monthly reports, policy retrieval for the RAG assistant.
-- Idempotent. Apply with `supabase db push` only after review (not applied by the build).

-- ---------------------------------------------------------------------------
-- 1. Monthly report queue
-- ---------------------------------------------------------------------------
-- Queues one 'bureau_wise' run per active bureau head and one per competent authority on the 1st of each month
-- (03:00 UTC). /api/reports/run-scheduled generates queued runs in each requester's scope and emails them.
create index if not exists report_runs_status_created_idx on public.report_runs(status, created_at);

create extension if not exists pg_cron;
do $$
begin
  if exists(select 1 from cron.job where jobname = 'nyayasetu-monthly-reports') then
    perform cron.unschedule('nyayasetu-monthly-reports');
  end if;
  perform cron.schedule(
    'nyayasetu-monthly-reports',
    '0 3 1 * *',
    $cron$
      insert into public.report_runs (report_type, requested_by, params, status)
      select 'bureau_wise', ra.user_id,
             jsonb_build_object('scheduled', true, 'month', to_char(now() at time zone 'utc', 'YYYY-MM')),
             'queued'
      from public.role_assignments ra
      where ra.role in ('bureau_head', 'competent_authority') and ra.revoked_at is null;
    $cron$
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Policy retrieval: cosine top-k over policy_chunks
-- ---------------------------------------------------------------------------
-- Security definer so the function can run for any officer, but it only returns corpus text (no user data).
-- Callers are restricted to authenticated officers by the application route.
create or replace function public.match_policy_chunks(query_embedding extensions.vector(768), k int default 3)
returns table (id uuid, document_name text, section text, page text, content_text text, similarity double precision)
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select pc.id, pc.document_name, pc.section, pc.page, pc.content_text,
         1 - (pc.embedding <=> query_embedding) as similarity
  from public.policy_chunks pc
  order by pc.embedding <=> query_embedding
  limit least(greatest(k, 1), 10);
$$;

revoke all on function public.match_policy_chunks(extensions.vector, int) from public, anon;
grant execute on function public.match_policy_chunks(extensions.vector, int) to authenticated;

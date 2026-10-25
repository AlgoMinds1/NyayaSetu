-- B11: students with any affiliation claim (verified or not) may file; the case is held at AICTE triage.
-- Verification status never lowers priority (plan §3.3).
drop policy if exists complaints_student_insert on public.complaints;
create policy complaints_student_insert on public.complaints for insert to authenticated with check(
  submitted_by=auth.uid() and status='submitted' and assigned_bureau is null
  and public.has_any_role(array['student']::public.app_role[])
  and exists(select 1 from public.affiliations a where a.user_id=auth.uid() and a.institution_id=complaints.institution_id)
);

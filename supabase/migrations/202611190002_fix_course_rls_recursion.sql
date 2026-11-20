-- Break the courses <-> enrollments RLS dependency cycle found by the Stage 2
-- authenticated integration test. The function answers one narrow ownership
-- question and does not expose enrollment rows.

create or replace function public.is_enrolled_in_course(candidate_course bigint, candidate_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.course_id = candidate_course and e.user_id = candidate_user
  );
$$;

revoke all on function public.is_enrolled_in_course(bigint, uuid) from public;
grant execute on function public.is_enrolled_in_course(bigint, uuid) to authenticated;

drop policy courses_read on public.courses;
create policy courses_read on public.courses for select to authenticated using (
  status = 'published' or public.is_admin()
  or public.is_enrolled_in_course(id, (select auth.uid()))
);

drop policy lessons_read on public.lessons;
create policy lessons_read on public.lessons for select to authenticated using (
  public.is_admin()
  or public.is_enrolled_in_course(course_id, (select auth.uid()))
  or exists (
    select 1 from public.courses c
    where c.id = lessons.course_id and c.status = 'published' and lessons.position = 1
  )
);

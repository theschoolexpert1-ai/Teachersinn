-- Stage 3C: RLS-safe learning aggregates, previews, atomic completion, and
-- race-free curriculum locking. No direct table privilege is broadened.

create or replace function public.course_learning_stats(candidate bigint)
returns table (lessons bigint, minutes bigint, learners bigint)
language sql stable security definer set search_path = '' as $$
  select count(l.id), coalesce(sum(l.minutes), 0),
    (select count(*) from public.enrollments e where e.course_id = candidate)
  from public.courses c left join public.lessons l on l.course_id = c.id
  where c.id = candidate and (
    c.status = 'published' or public.is_admin()
    or public.is_enrolled_in_course(c.id, (select auth.uid()))
  ) group by c.id;
$$;

create or replace function public.course_lesson_outline(candidate bigint)
returns table (id bigint, "position" integer, title text, minutes integer, body text, done boolean, locked boolean)
language sql stable security definer set search_path = '' as $$
  select l.id, l.position, l.title, l.minutes,
    case when public.is_admin() or public.is_enrolled_in_course(candidate, (select auth.uid())) or l.position = 1
      then l.body else null end,
    exists (select 1 from public.lesson_progress p where p.lesson_id=l.id and p.user_id=(select auth.uid())),
    not (public.is_admin() or public.is_enrolled_in_course(candidate, (select auth.uid())) or l.position = 1)
  from public.lessons l join public.courses c on c.id=l.course_id
  where l.course_id=candidate and (
    c.status='published' or public.is_admin()
    or public.is_enrolled_in_course(candidate, (select auth.uid()))
  ) order by l.position;
$$;

create or replace function public.complete_course_lesson(candidate bigint)
returns table (course_complete boolean, certificate_code text, newly_completed boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  target_course bigint;
  enrollment public.enrollments%rowtype;
  remaining bigint;
  generated_code text;
  inserted_count integer;
begin
  if current_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  select l.course_id into target_course from public.lessons l where l.id=candidate;
  if target_course is null then return; end if;
  select * into enrollment from public.enrollments e
    where e.user_id=current_user_id and e.course_id=target_course for update;
  if not found then raise exception 'enrollment required' using errcode='42501'; end if;
  insert into public.lesson_progress(user_id,lesson_id) values(current_user_id,candidate)
    on conflict do nothing;
  get diagnostics inserted_count = row_count;
  select count(*) into remaining from public.lessons l where l.course_id=target_course
    and not exists (select 1 from public.lesson_progress p where p.user_id=current_user_id and p.lesson_id=l.id);
  if remaining=0 and enrollment.completed_at is null then
    generated_code = 'TIN-' || upper(encode(extensions.gen_random_bytes(5),'hex'));
    update public.enrollments set completed_at=now(),certificate_code=generated_code
      where user_id=current_user_id and course_id=target_course and completed_at is null;
  else generated_code = null;
  end if;
  return query select remaining=0, generated_code, inserted_count > 0;
end;
$$;

create or replace function public.lock_course_for_enrollment()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.courses c where c.id=new.course_id for share;
  return new;
end;
$$;
create trigger enrollments_lock_course before insert on public.enrollments
for each row execute function public.lock_course_for_enrollment();

create or replace function public.protect_enrolled_course_curriculum()
returns trigger language plpgsql set search_path = '' as $$
declare affected_course bigint;
begin
  affected_course = case when tg_op='INSERT' then new.course_id else old.course_id end;
  perform 1 from public.courses c where c.id=affected_course for update;
  if exists(select 1 from public.enrollments e where e.course_id=affected_course) then
    raise exception 'curriculum cannot change after enrollment' using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.course_learning_stats(bigint) from public;
revoke all on function public.course_lesson_outline(bigint) from public;
revoke all on function public.complete_course_lesson(bigint) from public;
grant execute on function public.course_learning_stats(bigint) to authenticated;
grant execute on function public.course_lesson_outline(bigint) to authenticated;
grant execute on function public.complete_course_lesson(bigint) to authenticated;


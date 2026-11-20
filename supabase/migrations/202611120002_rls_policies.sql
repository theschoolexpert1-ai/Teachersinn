-- Row Level Security for TeachersInn application data.
-- Backend authorization remains required; these policies are a second boundary.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_settings a
    where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'active'
  );
$$;

create or replace function public.is_active_account(candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.account_settings a where a.id = candidate and a.status = 'active');
$$;

create or replace function public.can_message(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.connections c
      where c.status = 'accepted'
        and ((c.requester_id = first_user and c.addressee_id = second_user)
          or (c.requester_id = second_user and c.addressee_id = first_user))
    )
    or exists (
      select 1 from public.mentorships m
      where m.status = 'active'
        and ((m.mentee_id = first_user and m.mentor_id = second_user)
          or (m.mentee_id = second_user and m.mentor_id = first_user))
    );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_active_account(uuid) from public;
revoke all on function public.can_message(uuid, uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_account(uuid) to authenticated;
grant execute on function public.can_message(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.account_settings enable row level security;
alter table public.legacy_user_map enable row level security;
alter table public.audit_log enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.workshops enable row level security;
alter table public.workshop_regs enable row level security;
alter table public.connections enable row level security;
alter table public.messages enable row level security;
alter table public.communities enable row level security;
alter table public.posts enable row level security;
alter table public.replies enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_replies enable row level security;
alter table public.mentorships enable row level security;
alter table public.tutorials enable row level security;
alter table public.tutorial_views enable row level security;
alter table public.lesson_plans enable row level security;
alter table public.jobs enable row level security;
alter table public.notifications enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid()) or public.is_admin()
  or (directory_visible and public.is_active_account(id))
);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy account_settings_read_own on public.account_settings for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy account_settings_admin_update on public.account_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy legacy_map_admin_only on public.legacy_user_map for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());

create policy courses_read on public.courses for select to authenticated using (published or public.is_admin());
create policy courses_admin_write on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy lessons_read on public.lessons for select to authenticated using (
  public.is_admin() or exists (select 1 from public.courses c where c.id = course_id and c.published)
);
create policy lessons_admin_write on public.lessons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy enrollments_read_own on public.enrollments for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy enrollments_insert_own on public.enrollments for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.courses c where c.id = course_id and c.published));
create policy enrollments_admin_write on public.enrollments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy lesson_progress_read_own on public.lesson_progress for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy lesson_progress_insert_own on public.lesson_progress for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.lessons l join public.enrollments e on e.course_id = l.course_id
    where l.id = lesson_id and e.user_id = (select auth.uid())
  )
);
create policy lesson_progress_admin_write on public.lesson_progress for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy workshops_read on public.workshops for select to authenticated using (true);
create policy workshops_admin_write on public.workshops for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy workshop_regs_read_own on public.workshop_regs for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy workshop_regs_insert_own on public.workshop_regs for insert to authenticated with check (
  user_id = (select auth.uid()) and attended = false
  and exists (select 1 from public.workshops w where w.id = workshop_id and w.starts_at > now())
);
create policy workshop_regs_delete_own on public.workshop_regs for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy workshop_regs_admin_update on public.workshop_regs for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy connections_read_participant on public.connections for select to authenticated using (
  requester_id = (select auth.uid()) or addressee_id = (select auth.uid()) or public.is_admin()
);
create policy connections_request on public.connections for insert to authenticated with check (
  requester_id = (select auth.uid()) and addressee_id <> (select auth.uid()) and status = 'pending'
);
create policy connections_respond on public.connections for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status in ('accepted','declined'));
create policy connections_delete_participant on public.connections for delete to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()) or public.is_admin());

create policy messages_read_participant on public.messages for select to authenticated using (
  sender_id = (select auth.uid()) or recipient_id = (select auth.uid())
);
create policy messages_send on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid()) and sender_id <> recipient_id
  and public.can_message(sender_id, recipient_id)
);
create policy messages_mark_read on public.messages for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy communities_read on public.communities for select to authenticated using (true);
create policy communities_admin_write on public.communities for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy posts_read on public.posts for select to authenticated using (true);
create policy posts_insert_own on public.posts for insert to authenticated with check (user_id = (select auth.uid()));
create policy posts_update_own on public.posts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy posts_delete_own on public.posts for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy replies_read on public.replies for select to authenticated using (true);
create policy replies_insert_own on public.replies for insert to authenticated with check (user_id = (select auth.uid()));
create policy replies_update_own on public.replies for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy replies_delete_own on public.replies for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy tickets_read_owner on public.tickets for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy tickets_insert_owner on public.tickets for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and priority = 'normal');
create policy tickets_admin_update on public.tickets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy ticket_replies_read on public.ticket_replies for select to authenticated using (
  public.is_admin() or exists (select 1 from public.tickets t where t.id = ticket_id and t.user_id = (select auth.uid()))
);
create policy ticket_replies_insert on public.ticket_replies for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.tickets t where t.id = ticket_id
      and t.status <> 'closed' and (t.user_id = (select auth.uid()) or public.is_admin())
  )
);

create policy mentorships_read_participant on public.mentorships for select to authenticated using (
  mentee_id = (select auth.uid()) or mentor_id = (select auth.uid()) or public.is_admin()
);
create policy mentorships_request on public.mentorships for insert to authenticated with check (
  mentee_id = (select auth.uid()) and mentor_id <> (select auth.uid()) and status = 'requested'
  and exists (select 1 from public.profiles p where p.id = mentor_id and p.open_to_mentor)
);
create policy mentorships_mentor_update on public.mentorships for update to authenticated
  using (mentor_id = (select auth.uid()) or public.is_admin())
  with check (mentor_id = (select auth.uid()) or public.is_admin());

create or replace function public.enforce_mentorship_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if not ((old.status = 'requested' and new.status in ('active','declined'))
    or (old.status = 'active' and new.status = 'completed')) then
    raise exception 'invalid mentorship transition from % to %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger mentorship_status_transition before update of status on public.mentorships
for each row execute function public.enforce_mentorship_transition();

create policy tutorials_read on public.tutorials for select to authenticated using (true);
create policy tutorials_admin_write on public.tutorials for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy tutorial_views_own on public.tutorial_views for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy lesson_plans_own on public.lesson_plans for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy jobs_read on public.jobs for select to authenticated using (status = 'open' or public.is_admin());
create policy jobs_admin_write on public.jobs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy notifications_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Certificate verification exposes only the original public verification fields.
create or replace function public.verify_certificate(verification_code text)
returns table (name text, title text, cpd_hours integer, completed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.name, c.title, c.cpd_hours, e.completed_at
  from public.enrollments e
  join public.profiles p on p.id = e.user_id
  join public.courses c on c.id = e.course_id
  where e.certificate_code = verification_code and e.completed_at is not null;
$$;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

-- Remove implicit table access, then grant only operations backed by policies.
revoke all on all tables in schema public from anon, authenticated;
grant select (id, name, designation, school, subjects, grades, board, city, state, bio, experience_years, open_to_mentor, directory_visible, avatar_path, created_at, updated_at)
  on public.profiles to authenticated;
grant update (name, designation, school, subjects, grades, board, city, state, bio, experience_years, open_to_mentor, directory_visible, avatar_path, updated_at)
  on public.profiles to authenticated;
grant select on public.account_settings to authenticated;
grant update (role, status, updated_at) on public.account_settings to authenticated;
grant select, insert, update, delete on public.legacy_user_map to authenticated;
grant select on public.audit_log to authenticated;
grant select, insert, update, delete on public.courses, public.lessons to authenticated;
grant select, insert, update, delete on public.enrollments, public.lesson_progress to authenticated;
grant select, insert, update, delete on public.workshops, public.workshop_regs to authenticated;
grant select, insert, delete on public.connections to authenticated;
grant update (status, updated_at) on public.connections to authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant select, insert, update, delete on public.communities, public.posts, public.replies to authenticated;
grant select, insert on public.tickets to authenticated;
grant update (status, priority, updated_at) on public.tickets to authenticated;
grant select, insert on public.ticket_replies to authenticated;
grant select, insert on public.mentorships to authenticated;
grant update (status, updated_at) on public.mentorships to authenticated;
grant select, insert, update, delete on public.tutorials, public.tutorial_views to authenticated;
grant select, insert, update, delete on public.lesson_plans to authenticated;
grant select, insert, update, delete on public.jobs to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Stage 3B: expose only the existing administrator user-management contract.
-- Email remains owned by Supabase Auth and is returned only after authoritative
-- public.account_settings authorization. No auth schema privilege is granted.

create or replace function public.admin_list_users(
  search_text text default '', role_filter text default '', status_filter text default '', recent_only boolean default false
)
returns table (
  id uuid, name text, email text, role text, status text, designation text, school text, city text,
  created_at timestamptz, last_login_at timestamptz, profile_completion integer
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, u.email::text, a.role, a.status, p.designation, p.school, p.city,
    a.created_at, a.last_login_at,
    ((case when p.designation <> '' then 1 else 0 end + case when p.school <> '' then 1 else 0 end
      + case when p.subjects <> '' then 1 else 0 end + case when p.grades <> '' then 1 else 0 end
      + case when p.city <> '' then 1 else 0 end + case when p.bio <> '' then 1 else 0 end) * 100 / 6)::integer
  from public.profiles p
  join public.account_settings a on a.id = p.id
  join auth.users u on u.id = p.id
  where public.is_admin()
    and (coalesce(search_text, '') = '' or p.name ilike '%' || search_text || '%'
      or u.email ilike '%' || search_text || '%' or p.school ilike '%' || search_text || '%')
    and (coalesce(role_filter, '') = '' or a.role = role_filter)
    and (coalesce(status_filter, '') = '' or a.status = status_filter)
    and (not coalesce(recent_only, false) or a.created_at >= now() - interval '30 days')
  order by a.created_at desc, p.id desc limit 200;
$$;

create or replace function public.admin_user_detail(candidate uuid)
returns table (
  id uuid, name text, email text, role text, status text, designation text, school text,
  subjects text, grades text, board text, city text, state text, bio text,
  experience_years smallint, directory_visible boolean, open_to_mentor boolean,
  created_at timestamptz, last_login_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, u.email::text, a.role, a.status, p.designation, p.school,
    p.subjects, p.grades, p.board, p.city, p.state, p.bio, p.experience_years,
    p.directory_visible, p.open_to_mentor, a.created_at, a.last_login_at
  from public.profiles p
  join public.account_settings a on a.id = p.id
  join auth.users u on u.id = p.id
  where public.is_admin() and p.id = candidate;
$$;

revoke all on function public.admin_list_users(text,text,text,boolean) from public;
revoke all on function public.admin_user_detail(uuid) from public;
grant execute on function public.admin_list_users(text,text,text,boolean) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;

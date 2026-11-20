-- Stage 3H: narrow administrator mentorship visibility and audited self-deletion preparation.

create policy mentorships_admin_read on public.mentorships
  for select to authenticated using ((select public.is_admin()));

create or replace function public.prepare_own_account_deletion(candidate_ip inet default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  account_role text;
begin
  if uid is null then
    raise exception 'authenticated identity required' using errcode = '42501';
  end if;
  select role into account_role from public.account_settings where id = uid for update;
  if account_role is null then
    raise exception 'account not found' using errcode = 'P0002';
  end if;
  if account_role = 'admin' and
     (select count(*) from public.account_settings where role = 'admin' and status = 'active') <= 1 then
    raise exception 'last active administrator cannot be deleted' using errcode = '23514';
  end if;
  insert into public.audit_log(user_id,action,detail,ip)
  values(uid,'privacy.account_deletion_requested','self-service deletion requested',candidate_ip);
  return uid;
end;
$$;

revoke all on function public.prepare_own_account_deletion(inet) from public;
grant execute on function public.prepare_own_account_deletion(inet) to authenticated;

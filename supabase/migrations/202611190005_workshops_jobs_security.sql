-- Stage 3D: atomic workshop capacity, attendance verification, and safe counts.

create or replace function public.workshop_registration_count(candidate bigint)
returns integer language sql stable security definer set search_path='' as $$
  select count(*)::integer from public.workshop_regs where workshop_id=candidate;
$$;

create or replace function public.register_for_workshop(candidate bigint)
returns table (workshop_id bigint, registered_at timestamptz, already_registered boolean)
language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := (select auth.uid()); target public.workshops%rowtype; existing timestamptz;
begin
  if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into target from public.workshops where id=candidate for update;
  if not found then return; end if;
  if target.starts_at <= now() then raise exception 'workshop has started' using errcode='55000'; end if;
  select r.registered_at into existing from public.workshop_regs r where r.user_id=uid and r.workshop_id=candidate;
  if found then return query select candidate,existing,true; return; end if;
  if (select count(*) from public.workshop_regs r where r.workshop_id=candidate)>=target.capacity then
    raise exception 'workshop is full' using errcode='55000';
  end if;
  insert into public.workshop_regs(user_id,workshop_id) values(uid,candidate) returning workshop_regs.registered_at into existing;
  return query select candidate,existing,false;
end;
$$;

create or replace function public.set_workshop_attendance(candidate_workshop bigint,candidate_user uuid,new_status text)
returns table (user_id uuid,workshop_id bigint,attendance_status text,attendance_verified_at timestamptz,attendance_verified_by uuid,changed boolean)
language plpgsql volatile security definer set search_path='' as $$
declare verifier uuid := (select auth.uid()); target public.workshops%rowtype; registration public.workshop_regs%rowtype; changed_value boolean;
begin
  if not public.is_admin() then raise exception 'administrator required' using errcode='42501'; end if;
  if new_status not in ('pending','attended','absent') then raise exception 'invalid attendance status' using errcode='22023'; end if;
  select * into target from public.workshops where id=candidate_workshop;
  if not found then return; end if;
  if now() < target.starts_at + make_interval(mins=>target.duration_min) then raise exception 'workshop has not ended' using errcode='55000'; end if;
  select * into registration from public.workshop_regs where user_id=candidate_user and workshop_id=candidate_workshop for update;
  if not found then return; end if;
  changed_value := registration.attendance_status is distinct from new_status;
  if changed_value then
    update public.workshop_regs set attended=(new_status='attended'),attendance_status=new_status,
      attendance_verified_at=case when new_status='pending' then null else now() end,
      attendance_verified_by=case when new_status='pending' then null else verifier end
      where workshop_regs.user_id=candidate_user and workshop_regs.workshop_id=candidate_workshop;
  end if;
  return query select r.user_id,r.workshop_id,r.attendance_status,r.attendance_verified_at,r.attendance_verified_by,changed_value
    from public.workshop_regs r where r.user_id=candidate_user and r.workshop_id=candidate_workshop;
end;
$$;

create or replace function public.admin_workshop_registrations(candidate bigint,status_filter text default '',search_text text default '')
returns table (registration_id uuid,registered_at timestamptz,attendance_status text,attendance_verified_at timestamptz,
  name text,email text,workshop_id bigint,workshop_title text,starts_at timestamptz,duration_min integer,cpd_hours integer)
language sql stable security definer set search_path='' as $$
  select r.user_id,r.registered_at,r.attendance_status,r.attendance_verified_at,p.name,u.email::text,w.id,w.title,w.starts_at,w.duration_min,w.cpd_hours
  from public.workshop_regs r join public.profiles p on p.id=r.user_id join auth.users u on u.id=r.user_id join public.workshops w on w.id=r.workshop_id
  where public.is_admin() and r.workshop_id=candidate and (coalesce(status_filter,'')='' or r.attendance_status=status_filter)
    and (coalesce(search_text,'')='' or p.name ilike '%'||search_text||'%' or u.email ilike '%'||search_text||'%')
  order by lower(p.name),r.user_id;
$$;

revoke all on function public.workshop_registration_count(bigint) from public;
revoke all on function public.register_for_workshop(bigint) from public;
revoke all on function public.set_workshop_attendance(bigint,uuid,text) from public;
revoke all on function public.admin_workshop_registrations(bigint,text,text) from public;
grant execute on function public.workshop_registration_count(bigint) to authenticated;
grant execute on function public.register_for_workshop(bigint) to authenticated;
grant execute on function public.set_workshop_attendance(bigint,uuid,text) to authenticated;
grant execute on function public.admin_workshop_registrations(bigint,text,text) to authenticated;


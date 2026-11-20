-- Stage 3D corrective migration: qualify workshop registration columns that
-- conflict with RETURNS TABLE output variables in PL/pgSQL.

create or replace function public.set_workshop_attendance(candidate_workshop bigint,candidate_user uuid,new_status text)
returns table (user_id uuid,workshop_id bigint,attendance_status text,attendance_verified_at timestamptz,attendance_verified_by uuid,changed boolean)
language plpgsql volatile security definer set search_path='' as $$
declare verifier uuid := (select auth.uid()); target public.workshops%rowtype; registration public.workshop_regs%rowtype; changed_value boolean;
begin
  if not public.is_admin() then raise exception 'administrator required' using errcode='42501'; end if;
  if new_status not in ('pending','attended','absent') then raise exception 'invalid attendance status' using errcode='22023'; end if;
  select * into target from public.workshops w where w.id=candidate_workshop;
  if not found then return; end if;
  if now() < target.starts_at + make_interval(mins=>target.duration_min) then raise exception 'workshop has not ended' using errcode='55000'; end if;
  select r.* into registration from public.workshop_regs r
    where r.user_id=candidate_user and r.workshop_id=candidate_workshop for update;
  if not found then return; end if;
  changed_value := registration.attendance_status is distinct from new_status;
  if changed_value then
    update public.workshop_regs r set attended=(new_status='attended'),attendance_status=new_status,
      attendance_verified_at=case when new_status='pending' then null else now() end,
      attendance_verified_by=case when new_status='pending' then null else verifier end
      where r.user_id=candidate_user and r.workshop_id=candidate_workshop;
  end if;
  return query select r.user_id,r.workshop_id,r.attendance_status,r.attendance_verified_at,r.attendance_verified_by,changed_value
    from public.workshop_regs r where r.user_id=candidate_user and r.workshop_id=candidate_workshop;
end;
$$;

revoke all on function public.set_workshop_attendance(bigint,uuid,text) from public;
grant execute on function public.set_workshop_attendance(bigint,uuid,text) to authenticated;

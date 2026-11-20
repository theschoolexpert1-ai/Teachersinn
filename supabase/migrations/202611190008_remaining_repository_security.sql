-- Stage 3F: remaining mentorship, support and lesson-plan transactional workflows.

create or replace function public.notification_enabled(candidate uuid, category text)
returns boolean language sql stable security definer set search_path='' as $$
 select case category when 'messages' then coalesce(n.messages,true) when 'connections' then coalesce(n.connections,true)
 when 'community' then coalesce(n.community,true) when 'workshops' then coalesce(n.workshops,true)
 when 'learning' then coalesce(n.learning,true) when 'mentorship' then coalesce(n.mentorship,true)
 when 'support' then coalesce(n.support,true) else true end
 from (select 1) seed left join public.notification_preferences n on n.user_id=candidate;
$$;

create unique index mentorships_open_pair_uidx on public.mentorships(mentee_id,mentor_id) where status in ('requested','active');

create or replace function public.request_mentorship(candidate uuid,candidate_topic text,candidate_message text)
returns bigint language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); result bigint;
begin
 if uid=candidate then raise exception 'mentor not found' using errcode='22023'; end if;
 if not exists(select 1 from public.profiles p join public.account_settings a on a.id=p.id where p.id=candidate and p.open_to_mentor and a.status='active') then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||candidate::text,0));
 if exists(select 1 from public.mentorships where mentee_id=uid and mentor_id=candidate and status in ('requested','active')) then raise exception 'duplicate mentorship request' using errcode='23505'; end if;
 insert into public.mentorships(mentee_id,mentor_id,topic,message) values(uid,candidate,candidate_topic,candidate_message) returning id into result;
 if public.notification_enabled(candidate,'mentorship') then insert into public.notifications(user_id,text,link) select candidate,p.name||' requested mentorship on "'||left(candidate_topic,100)||'".','#/support/mentorship' from public.profiles p where p.id=uid; end if;
 return result;
end;$$;

create or replace function public.transition_mentorship(candidate bigint,action text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); m public.mentorships%rowtype; next_status text;
begin
 select * into m from public.mentorships where id=candidate and mentor_id=uid for update;
 if not found then return null; end if;
 next_status:=case when m.status='requested' and action='accept' then 'active' when m.status='requested' and action='decline' then 'declined' when m.status='active' and action='complete' then 'completed' end;
 if next_status is null then raise exception 'invalid mentorship transition' using errcode='55000'; end if;
 update public.mentorships set status=next_status,updated_at=now() where id=candidate;
 if action='accept' and public.notification_enabled(m.mentee_id,'mentorship') then insert into public.notifications(user_id,text,link) select m.mentee_id,p.name||' accepted your mentorship request. Say hello!','#/messages/'||uid::text from public.profiles p where p.id=uid; end if;
 return next_status;
end;$$;

create or replace function public.reply_support_ticket(candidate bigint,content text)
returns bigint language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); t public.tickets%rowtype; result bigint; staff boolean:=public.is_admin();
begin
 select * into t from public.tickets where id=candidate and (user_id=uid or staff) for update;
 if not found then return null; end if; if t.status='closed' then raise exception 'ticket is closed' using errcode='55000'; end if;
 insert into public.ticket_replies(ticket_id,user_id,body) values(candidate,uid,content) returning id into result;
 update public.tickets set status=case when staff and t.status='open' then 'in_progress' else t.status end,updated_at=now() where id=candidate;
 if staff and t.user_id<>uid then insert into public.notifications(user_id,text,link) values(t.user_id,'Support replied to your ticket "'||left(t.subject,120)||'".','#/ticket/'||candidate::text); end if;
 return result;
end;$$;

create or replace function public.admin_update_ticket(candidate bigint,new_status text,new_priority text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); t public.tickets%rowtype;
begin
 if not public.is_admin() then raise exception 'administrator required' using errcode='42501'; end if;
 select * into t from public.tickets where id=candidate for update; if not found then return false; end if;
 update public.tickets set status=coalesce(new_status,status),priority=coalesce(new_priority,priority),updated_at=now() where id=candidate;
 if new_status is not null and new_status<>t.status then insert into public.notifications(user_id,text,link) values(t.user_id,'Your ticket "'||left(t.subject,120)||'" is now '||replace(new_status,'_',' ')||'.','#/ticket/'||candidate::text); end if;
 insert into public.audit_log(user_id,action,detail) values(uid,'admin.ticket_update','#'||candidate::text||' '||coalesce(new_status,t.status)||'/'||coalesce(new_priority,t.priority)); return true;
end;$$;

create or replace function public.admin_support_tickets(status_filter text default '',search_text text default '')
returns table(id bigint,user_id uuid,category text,subject text,body text,status text,priority text,created_at timestamptz,updated_at timestamptz,requester text,email text)
language sql stable security definer set search_path='' as $$
 select t.id,t.user_id,t.category,t.subject,t.body,t.status,t.priority,t.created_at,t.updated_at,p.name,u.email::text
 from public.tickets t join public.profiles p on p.id=t.user_id join auth.users u on u.id=t.user_id
 where public.is_admin() and (coalesce(status_filter,'')='' or t.status=status_filter)
 and (coalesce(search_text,'')='' or t.subject ilike '%'||search_text||'%' or p.name ilike '%'||search_text||'%' or u.email ilike '%'||search_text||'%')
 order by case t.status when 'open' then 0 when 'in_progress' then 1 else 2 end,t.updated_at desc limit 200;
$$;

revoke all on function public.notification_enabled(uuid,text),public.request_mentorship(uuid,text,text),public.transition_mentorship(bigint,text),public.reply_support_ticket(bigint,text),public.admin_update_ticket(bigint,text,text),public.admin_support_tickets(text,text) from public;
grant execute on function public.request_mentorship(uuid,text,text),public.transition_mentorship(bigint,text),public.reply_support_ticket(bigint,text),public.admin_update_ticket(bigint,text,text),public.admin_support_tickets(text,text) to authenticated;

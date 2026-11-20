-- Stage 3E: atomic networking, messaging, community notifications and moderation.

create unique index connections_unordered_pair_uidx
  on public.connections (least(requester_id,addressee_id),greatest(requester_id,addressee_id));

create or replace function public.notification_enabled(candidate uuid, category text)
returns boolean language sql stable security definer set search_path='' as $$
  select case category
    when 'messages' then coalesce(n.messages,true)
    when 'connections' then coalesce(n.connections,true)
    when 'community' then coalesce(n.community,true)
    else true end
  from (select 1) seed left join public.notification_preferences n on n.user_id=candidate;
$$;

create or replace function public.network_profile(candidate uuid)
returns table (id uuid,name text,designation text,school text,subjects text,grades text,board text,city text,state text,bio text,experience_years integer,open_to_mentor boolean,directory_visible boolean,avatar_path text)
language sql stable security definer set search_path='' as $$
  select p.id,p.name,p.designation,p.school,p.subjects,p.grades,p.board,p.city,p.state,p.bio,p.experience_years,p.open_to_mentor,p.directory_visible,p.avatar_path
  from public.profiles p join public.account_settings a on a.id=p.id
  where p.id=candidate and p.id<>(select auth.uid()) and a.status='active'
    and (p.directory_visible or exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_id=(select auth.uid()) and c.addressee_id=p.id) or (c.addressee_id=(select auth.uid()) and c.requester_id=p.id))));
$$;

create or replace function public.request_connection(candidate uuid)
returns table (connection_id bigint,status text,direction text)
language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); c public.connections%rowtype; notify_target boolean:=false;
begin
  if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if uid=candidate then raise exception 'cannot connect with yourself' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p join public.account_settings a on a.id=p.id where p.id=candidate and p.directory_visible and a.status='active') then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(uid,candidate)::text||greatest(uid,candidate)::text,0));
  select * into c from public.connections x where (x.requester_id=uid and x.addressee_id=candidate) or (x.requester_id=candidate and x.addressee_id=uid) for update;
  if found then
    if c.status='pending' and c.addressee_id=uid then update public.connections set status='accepted',updated_at=now() where id=c.id returning * into c;
    elsif c.status='declined' and c.requester_id=uid then update public.connections set status='pending',created_at=now(),updated_at=now() where id=c.id returning * into c; notify_target:=true;
    end if;
  else
    insert into public.connections(requester_id,addressee_id) values(uid,candidate) returning * into c; notify_target:=true;
  end if;
  if notify_target and public.notification_enabled(candidate,'connections') then
    insert into public.notifications(user_id,text,link) select candidate,'New connection request from '||p.name||'.','#/network/requests' from public.profiles p where p.id=uid;
  end if;
  return query select c.id,c.status,case when c.requester_id=uid then 'out' else 'in' end;
end;$$;

create or replace function public.respond_connection(candidate bigint,action text)
returns table (connection_id bigint,status text)
language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); c public.connections%rowtype;
begin
  if action not in ('accept','decline') then raise exception 'invalid connection action' using errcode='22023'; end if;
  select * into c from public.connections x where x.id=candidate and x.addressee_id=uid and x.status='pending' for update;
  if not found then return; end if;
  update public.connections set status=case when action='accept' then 'accepted' else 'declined' end,updated_at=now() where id=c.id returning * into c;
  if action='accept' and public.notification_enabled(c.requester_id,'connections') then
    insert into public.notifications(user_id,text,link) select c.requester_id,p.name||' accepted your connection request.','#/messages/'||uid::text from public.profiles p where p.id=uid;
  end if;
  return query select c.id,c.status;
end;$$;

create or replace function public.send_private_message(candidate uuid,content text)
returns table (id bigint,sender_id uuid,recipient_id uuid,body text,created_at timestamptz)
language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); m public.messages%rowtype;
begin
  if char_length(trim(coalesce(content,''))) not between 1 and 2000 then raise exception 'invalid message' using errcode='22023'; end if;
  perform 1 from public.connections c where c.status='accepted' and ((c.requester_id=uid and c.addressee_id=candidate) or (c.requester_id=candidate and c.addressee_id=uid)) for share;
  if not found then perform 1 from public.mentorships x where x.status='active' and ((x.mentee_id=uid and x.mentor_id=candidate) or (x.mentee_id=candidate and x.mentor_id=uid)) for share; end if;
  if not found then raise exception 'messaging requires an active connection' using errcode='42501'; end if;
  insert into public.messages(sender_id,recipient_id,body) values(uid,candidate,trim(content)) returning * into m;
  if public.notification_enabled(candidate,'messages') then insert into public.notifications(user_id,text,link) select candidate,'New message from '||p.name||'.','#/messages/'||uid::text from public.profiles p where p.id=uid; end if;
  return query select m.id,m.sender_id,m.recipient_id,m.body,m.created_at;
end;$$;

create or replace function public.create_community_reply(candidate bigint,content text)
returns table (id bigint,duplicate boolean)
language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); p public.posts%rowtype; rid bigint;
begin
  if char_length(trim(coalesce(content,'')))<1 then raise exception 'invalid reply' using errcode='22023'; end if;
  select * into p from public.posts where posts.id=candidate;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(candidate::text||uid::text||trim(content),0));
  select r.id into rid from public.replies r where r.post_id=candidate and r.user_id=uid and r.body=trim(content) and r.created_at>=now()-interval '10 seconds' order by r.id desc limit 1;
  if found then return query select rid,true; return; end if;
  insert into public.replies(post_id,user_id,body) values(candidate,uid,trim(content)) returning replies.id into rid;
  if p.user_id<>uid and public.notification_enabled(p.user_id,'community') then insert into public.notifications(user_id,text,link) select p.user_id,actor.name||' replied to "'||left(p.title,120)||'".','#/post/'||p.id::text from public.profiles actor where actor.id=uid; end if;
  return query select rid,false;
end;$$;

create or replace function public.moderate_community(kind text,candidate bigint)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); affected integer;
begin
  if not public.is_admin() then raise exception 'administrator required' using errcode='42501'; end if;
  if kind='post' then delete from public.posts where id=candidate;
  elsif kind='reply' then delete from public.replies where id=candidate;
  else raise exception 'invalid moderation kind' using errcode='22023'; end if;
  get diagnostics affected=row_count;
  if affected>0 then insert into public.audit_log(user_id,action,detail) values(uid,'community.moderate',kind||'#'||candidate::text); end if;
  return affected>0;
end;$$;

revoke all on function public.notification_enabled(uuid,text),public.network_profile(uuid),public.request_connection(uuid),public.respond_connection(bigint,text),public.send_private_message(uuid,text),public.create_community_reply(bigint,text),public.moderate_community(text,bigint) from public;
grant execute on function public.network_profile(uuid),public.request_connection(uuid),public.respond_connection(bigint,text),public.send_private_message(uuid,text),public.create_community_reply(bigint,text),public.moderate_community(text,bigint) to authenticated;

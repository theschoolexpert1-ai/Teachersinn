'use strict';

const fs=require('node:fs');const path=require('node:path');
const OWNERSHIP_SQL=`select
(select count(*)::int from public.profiles p where p.id=any($1::uuid[])) profiles,
(select count(*)::int from public.account_settings a where a.id=any($1::uuid[])) settings,
(select count(*)::int from public.account_settings a where a.id=$2 and a.role='admin') administrator,
(select count(*)::int from public.messages m where m.sender_id=m.recipient_id) self_messages,
(select count(*)::int from public.connections c where c.requester_id=c.addressee_id) self_connections`;
const BUSINESS_RULES_SQL=`select
(select count(*)::int from public.courses c where c.published is distinct from (c.status='published')) publication_errors,
(select count(*)::int from public.workshop_regs r where r.attended is distinct from (r.attendance_status='attended') or (r.attendance_status='pending' and (r.attendance_verified_at is not null or r.attendance_verified_by is not null)) or (r.attendance_status<>'pending' and (r.attendance_verified_at is null or r.attendance_verified_by is null))) attendance_errors,
(select count(*)::int from public.workshop_regs r left join public.account_settings a on a.id=r.attendance_verified_by where r.attendance_verified_by is not null and a.role is distinct from 'admin') attendance_admin_errors,
(select count(*)::int from public.workshops w where (select count(*) from public.workshop_regs r where r.workshop_id=w.id)>w.capacity) capacity_errors,
(select count(*)::int from public.messages m where not exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_id=m.sender_id and c.addressee_id=m.recipient_id) or (c.requester_id=m.recipient_id and c.addressee_id=m.sender_id))) and not exists(select 1 from public.mentorships n where n.status='active' and ((n.mentor_id=m.sender_id and n.mentee_id=m.recipient_id) or (n.mentor_id=m.recipient_id and n.mentee_id=m.sender_id)))) messaging_errors,
(select count(*)::int from public.enrollments e where (e.completed_at is null) is distinct from (e.certificate_code is null)) certificate_errors,
(select count(*)::int from public.enrollments e where e.completed_at is not null and exists(select 1 from public.lessons l where l.course_id=e.course_id and not exists(select 1 from public.lesson_progress p where p.user_id=e.user_id and p.lesson_id=l.id))) progress_errors,
(select count(*)::int from public.job_applications j join public.jobs x on x.id=j.job_id where x.status<>'open') job_application_errors,
(select count(*)::int from public.connections c where c.requester_id=c.addressee_id) connection_errors,
(select count(*)::int from public.mentorships m where m.mentee_id=m.mentor_id) mentorship_errors`;
const FOREIGN_KEYS_SQL=`select count(*)::int invalid from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f' and not c.convalidated`;
function quote(value){return `"${String(value).replaceAll('"','""')}"`;}
function selectRows(table,columns){return `select ${columns.map(quote).join(',')} from public.${quote(table)}`;}
function deleteRows(table,keys){return `delete from public.${quote(table)} where ${keys.map((key,index)=>`${quote(key)}=$${index+1}`).join(' and ')}`;}
function migrationContract(root=path.resolve('supabase','migrations')){const tables=new Map();for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.sql')).sort()){const sql=fs.readFileSync(path.join(root,file),'utf8');for(const match of sql.matchAll(/create table public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)){const columns=tables.get(match[1])||new Set();for(const line of match[2].split(/\r?\n/)){const token=/^\s*([a-z_][a-z0-9_]*)\s+/i.exec(line)?.[1]?.toLowerCase();if(token&&!['constraint','primary','foreign','unique','check'].includes(token))columns.add(token);}tables.set(match[1],columns);}for(const match of sql.matchAll(/alter table public\.([a-z_]+) add column ([a-z_][a-z0-9_]*)/gi)){if(!tables.has(match[1]))tables.set(match[1],new Set());tables.get(match[1]).add(match[2]);}}return tables;}
function validateQualifiedSql(sql,contract=migrationContract()){const aliases=new Map(),tables=new Set();for(const match of sql.matchAll(/(?:from|join)\s+public\.([a-z_]+)(?:\s+(?!where\b|on\b|join\b|left\b|right\b|inner\b|outer\b)([a-z_][a-z0-9_]*))?/gi)){const table=match[1],alias=match[2]||table;if(!contract.has(table))throw new Error(`Unknown verification table: ${table}`);if(!aliases.has(alias))aliases.set(alias,new Set());aliases.get(alias).add(table);tables.add(table);}for(const match of sql.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi)){const alias=match[1],column=match[2];if(['public','pg_catalog'].includes(alias))continue;const candidates=aliases.get(alias);if(candidates&&![...candidates].some(table=>contract.get(table).has(column)))throw new Error(`Unknown verification column: ${[...candidates].join('|')}.${column}`);}return{tables:[...tables],valid:true};}
function validateTableColumns(table,columns,contract=migrationContract()){if(!contract.has(table))throw new Error(`Unknown verification table: ${table}`);for(const column of columns)if(!contract.get(table).has(column))throw new Error(`Unknown verification column: ${table}.${column}`);return true;}
module.exports={OWNERSHIP_SQL,BUSINESS_RULES_SQL,FOREIGN_KEYS_SQL,quote,selectRows,deleteRows,migrationContract,validateQualifiedSql,validateTableColumns};

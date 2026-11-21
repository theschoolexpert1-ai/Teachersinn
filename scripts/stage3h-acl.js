'use strict';
const {Pool}=require('pg');const{postgresConfig}=require('../backend/src/postgres/config');
(async()=>{const config=postgresConfig(process.env),pool=new Pool({connectionString:config.connectionString,ssl:config.ssl,max:1});try{const result=await pool.query(`select p.proacl::text acl,pg_get_userbyid(p.proowner) owner,
has_function_privilege('authenticated',p.oid,'execute') authenticated_execute,
has_function_privilege('anon',p.oid,'execute') anon_execute,
has_function_privilege('public',p.oid,'execute') public_execute,
pg_has_role('anon','authenticated','member') anon_is_authenticated_member,
pg_has_role('anon','service_role','member') anon_is_service_member
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='prepare_own_account_deletion'`);console.log(JSON.stringify({tlsVerified:config.ssl.rejectUnauthorized===true,acl:result.rows}));}finally{await pool.end();}})().catch(error=>{console.error(JSON.stringify({error:error.code||error.name,message:error.message}));process.exitCode=1;});

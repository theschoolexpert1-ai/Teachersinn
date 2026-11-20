'use strict';
const fs=require('node:fs');const path=require('node:path');const migration=require('./stage3i');
const value=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null};
const db=value('--db'),manifest=value('--manifest'),report=value('--report');
if(!db||!manifest||process.argv.includes('--execute')){console.error('Usage: node scripts/migration/dry-run.js --db <snapshot.db> --manifest <private-manifest.json> [--report <report.json>]');process.exit(2)}
try{const source=migration.readSource(db),plan=migration.buildPlan(source,migration.loadManifest(manifest));const safe={mode:'dry-run',readOnly:true,sourceCounts:plan.sourceCounts,targetCounts:plan.targetCounts,order:plan.order,batches:plan.batches.map(({id,table,count,fingerprint})=>({id,table,count,fingerprint}))};if(report)fs.writeFileSync(path.resolve(report),JSON.stringify(safe,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(safe,null,2));}catch(error){console.error(JSON.stringify(migration.redact(error),null,2));process.exitCode=1;}

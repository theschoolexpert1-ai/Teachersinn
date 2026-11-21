'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../security');
const { mapDatabaseError } = require('./errors');
const { runWithPostgresIdentity } = require('./http-context');

const MAX_BODY = 64 * 1024;
class HarnessHttpError extends Error { constructor(status, message) { super(message); this.status=status; } }

function readBody(req) {
  return new Promise((resolve,reject)=>{let size=0;const chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){reject(new HarnessHttpError(413,'Request too large.'));req.destroy();return;}chunks.push(chunk);});req.on('end',()=>{if(!chunks.length)return resolve({});try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();resolve(value);}catch{reject(new HarnessHttpError(400,'Malformed JSON.'));}});req.on('error',reject);});
}
function send(res,status,body,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(typeof body==='string'?body:JSON.stringify(body));}
function routeCollector(){const routes=[];const route=(method,pattern,access,handler)=>{if(routes.some(x=>x.method===method&&x.pattern===pattern))throw new Error(`Duplicate route: ${method} ${pattern}`);const keys=[];const re=new RegExp('^'+pattern.replace(/:(\w+)/g,(_,key)=>{keys.push(key);return'([^/]+)';})+'$');routes.push({method,pattern,access,handler,keys,re});};return{route,routes};}

const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
function serveStatic(req,res,pathname,root){let rel=pathname==='/'?'index.html':pathname.replace(/^\//,'');const file=path.normalize(path.join(root,rel));if(!file.startsWith(root+path.sep))return send(res,403,{error:'Forbidden'});fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){if(!path.extname(rel))return serveStatic(req,res,'/',root);res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end('Not found');}res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':path.extname(file)==='.html'?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);});}
function createIsolatedPostgresHttpHarness({ routes, loadSession, appOrigin, close = async()=>{}, poweredBy = 'TeachersInn-Postgres-Test', staticDir = null, trustProxy = false }) {
  if (!Array.isArray(routes)||!routes.length) throw new TypeError('Registered routes are required.');
  if (typeof loadSession!=='function') throw new TypeError('An authoritative session loader is required.');
  const expectedOrigin=String(appOrigin||'').replace(/\/$/,'');
  if (!expectedOrigin) throw new Error('A test-scoped application origin is required.');
  const server=http.createServer(async(req,res)=>{
    S.securityHeaders(res,{secure:expectedOrigin.startsWith('https://')});res.setHeader('X-Powered-By',poweredBy);
    let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{return send(res,400,{error:'Bad request.'});}
    if(!url.pathname.startsWith('/api/')){if(!staticDir)return send(res,404,{error:'Not found.'});return serveStatic(req,res,url.pathname,staticDir);}
    try{
      const match=routes.find(x=>x.method===req.method&&x.re.test(url.pathname));
      if(!match)throw new HarnessHttpError(routes.some(x=>x.re.test(url.pathname))?405:404,routes.some(x=>x.re.test(url.pathname))?'Method not allowed.':'Not found.');
      const session=await loadSession(req,res);
      const write=!['GET','HEAD'].includes(req.method);
      if(write){if(req.headers.origin&&req.headers.origin!==expectedOrigin)throw new HarnessHttpError(403,'Cross-origin request blocked.');if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HarnessHttpError(415,'Content-Type must be application/json.');if(session&&!S.safeEqual(req.headers['x-csrf-token']||'',session.csrf_token||''))throw new HarnessHttpError(403,'Security token missing or expired. Refresh the page.');}
      if(match.access!=='public'){if(!session?.identity||!session.user)throw new HarnessHttpError(401,'Please sign in to continue.');if(match.access==='admin'&&session.identity.account?.role!=='admin')throw new HarnessHttpError(403,'Administrators only.');}
      const found=url.pathname.match(match.re),params={};match.keys.forEach((key,index)=>{params[key]=found[index+1];});
      const body=write?await readBody(req):{};const forwarded=trustProxy?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():'';const ctx={req,res,params,query:url.searchParams,body,session,user:session?.user||null,ip:forwarded||req.socket.remoteAddress};
      const execute=()=>match.handler(ctx);const result=match.access==='public'?await execute():await runWithPostgresIdentity(session,execute);
      if(Array.isArray(result)&&typeof result[0]==='number')return send(res,result[0],result[1],result[2]);return send(res,200,result??{ok:true});
    }catch(error){const safe=error?.status?error:mapDatabaseError(error);return send(res,safe.status||500,{error:safe.status?safe.message:'Something went wrong on our side. Please try again.'});}
  });
  server.headersTimeout=20_000;server.requestTimeout=30_000;server.keepAliveTimeout=5_000;
  let stopped=false;
  async function shutdown(){if(stopped)return;stopped=true;if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await close();}
  return Object.freeze({
    routeInventory:routes.map(({method,pattern,access})=>({method,pattern,access})),
    async listen(){if(server.listening)throw new Error('Harness is already listening.');await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return`http://127.0.0.1:${server.address().port}`;},
    async shutdown(){if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await close();},
    server,shutdown,
  });
}

module.exports={ HarnessHttpError,routeCollector,createIsolatedPostgresHttpHarness };

'use strict';
function createNotificationsService({repository,nowIso,HttpError}) { const safe=row=>({...row,link:/^#\/[a-z0-9/?=&._-]*$/i.test(row.link||'')?row.link:''}); return {
  preview(userId){return{unread:repository.unread(userId),items:repository.preview(userId).map(safe)};},
  list(userId,state,category,page){const limit=20,args=[userId,state,state,state,category,category],total=repository.total(args);const counts=Object.fromEntries(repository.counts(userId).map(x=>[x.category,x.n]));return{items:repository.page(args,limit,(page-1)*limit).map(safe),total,unread:repository.unread(userId),page,pages:Math.max(1,Math.ceil(total/limit)),counts};},
  markOne(userId,id){const r=repository.markOne(userId,id,nowIso());if(!r.changes)throw new HttpError(404,'Notification not found.');return{ok:true,unread:repository.unread(userId)};},
  markAll(userId){const r=repository.markAll(userId,nowIso());return{ok:true,updated:r.changes,unread:0};},
}; }
module.exports={createNotificationsService};

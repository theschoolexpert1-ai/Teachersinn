'use strict';
function createSupportService({repository,tx,notify,audit,nowIso,HttpError}) { const visible=(ctx,id)=>{const t=repository.ticket(id);if(!t||(t.user_id!==ctx.user.id&&ctx.user.role!=='admin'))throw new HttpError(404,'Ticket not found.');return t;}; return {
  list:(u)=>repository.list(u), create(ctx,c,s,b){const r=repository.create(ctx.user.id,c,s,b);return{ok:true,id:Number(r.lastInsertRowid)};},
  detail(ctx,id){const t=visible(ctx,id);return{ticket:t,replies:repository.replies(id)};},
  reply(ctx,id,body){const t=visible(ctx,id);if(t.status==='closed')throw new HttpError(409,'This ticket is closed and cannot receive new replies.');return tx(()=>{repository.addReply(id,ctx.user.id,body);const staff=ctx.user.role==='admin'&&t.user_id!==ctx.user.id;repository.updateReplyState(id,staff&&t.status==='open'?'in_progress':t.status,nowIso());if(staff)notify(t.user_id,`Support replied to your ticket "${t.subject}".`,`#/ticket/${id}`);return{ok:true};});},
  adminUpdate(ctx,id,status,priority){const t=repository.ticket(id);if(!t)throw new HttpError(404,'Ticket not found.');return tx(()=>{repository.updateAdmin(id,status||t.status,priority||t.priority,nowIso());if((status||t.status)!==t.status)notify(t.user_id,`Your ticket "${t.subject}" is now ${(status||t.status).replace('_',' ')}.`,`#/ticket/${id}`);audit(ctx.user.id,'admin.ticket_update',`#${id} ${status||t.status}/${priority||t.priority}`,ctx.ip);return{ok:true};});},
}; }
module.exports={createSupportService};

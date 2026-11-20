'use strict';
function createMentorshipService({repository,tx,notify,HttpError,publicUserColumns}) { return {
  mentors:(u)=>repository.mentors(u,publicUserColumns), list:(u)=>repository.list(u),
  request(ctx,mentorId,topic,message){const mentor=repository.mentor(mentorId);if(!mentor||mentorId===ctx.user.id)throw new HttpError(404,'Mentor not found.');if(repository.duplicate(ctx.user.id,mentorId))throw new HttpError(409,'You already have a request with this mentor.');return tx(()=>{repository.create(ctx.user.id,mentorId,topic,message);notify(mentorId,`${ctx.user.name} requested mentorship on "${topic}".`,'#/support/mentorship','mentorship');return{ok:true};});},
  respond(ctx,id,action){const m=repository.forMentor(id,ctx.user.id);if(!m)throw new HttpError(404,'Request not found.');const allowed=m.status==='requested'?['accept','decline']:m.status==='active'?['complete']:[];if(!allowed.includes(action))throw new HttpError(409,`Cannot ${action} a ${m.status} mentorship.`);const status={accept:'active',decline:'declined',complete:'completed'}[action];return tx(()=>{repository.update(id,status);if(action==='accept')notify(m.mentee_id,`${ctx.user.name} accepted your mentorship request. Say hello!`,`#/messages/${ctx.user.id}`,'mentorship');return{ok:true};});},
}; }
module.exports={createMentorshipService};

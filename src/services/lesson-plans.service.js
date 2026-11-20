'use strict';
function createLessonPlansService({repository,HttpError}) { return {
  overview:(u)=>repository.overview(u),list:(u,f)=>repository.list(u,f), detail(u,id){const p=repository.find(u,id);if(!p)throw new HttpError(404,'Lesson plan not found.');return p;},
  create(u,f){const d=repository.duplicate(u,f);if(d)return{ok:true,id:d.id,duplicate:true};const r=repository.create(u,f);return{ok:true,id:Number(r.lastInsertRowid)};},
  update(u,id,f){if(!repository.update(u,id,f).changes)throw new HttpError(404,'Plan not found.');return{ok:true};}, delete(u,id){if(!repository.delete(u,id).changes)throw new HttpError(404,'Plan not found.');return{ok:true};},
  duplicate(u,id){const p=repository.find(u,id);if(!p)throw new HttpError(404,'Lesson plan not found.');const f={title:`${p.title} (Copy)`.slice(0,150),subject:p.subject,grade:p.grade,plan_date:'',duration_min:p.duration_min,objectives:p.objectives,materials:p.materials,activities:p.activities,assessment:p.assessment,reflection:p.reflection};const r=repository.create(u,f);return{ok:true,id:Number(r.lastInsertRowid)};},
}; }
module.exports={createLessonPlansService};

'use strict';
function createSettingsService({repository,audit,preferenceKeys}) { const defaults=Object.fromEntries(preferenceKeys.map(k=>[k,1])); return {
  overview(user){const fields=[user.designation,user.school,user.subjects,user.grades,user.board,user.city,user.bio];return{account:{id:user.id,name:user.name,email:user.email,role:user.role,status:user.status,created_at:user.created_at,last_login_at:user.last_login_at},profileCompletion:Math.round(fields.filter(v=>String(v||'').trim()).length/fields.length*100),hasCareerProfile:repository.hasCareerProfile(user.id),notifications:repository.preferences(user.id)||defaults};},
  updateNotifications(ctx,body){const values=preferenceKeys.map(k=>body[k]===false||body[k]===0?0:1);repository.savePreferences(ctx.user.id,preferenceKeys,values);audit(ctx.user.id,'settings.notifications','in-app preferences updated',ctx.ip);return{ok:true,notifications:Object.fromEntries(preferenceKeys.map((k,i)=>[k,values[i]]))};},
}; }
module.exports={createSettingsService};

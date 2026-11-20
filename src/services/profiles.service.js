'use strict';

function createProfilesService({ repository, security, tx, audit, nowIso, safeUser, HttpError }) {
  return {
    update(ctx, fields) { repository.update(ctx.user.id, fields); audit(ctx.user.id,'profile.update','',ctx.ip); return {ok:true}; },
    export(ctx) { audit(ctx.user.id,'privacy.export','',ctx.ip); return { exported_at:nowIso(), notice:'Your personal data held by TeachersInn (Digital Personal Data Protection Act, 2023 — right to access).', profile:safeUser(ctx.user), ...repository.exportData(ctx.user.id) }; },
    deleteAccount(ctx, password) {
      if(!security.verifyPassword(password,ctx.user.password_hash)) throw new HttpError(400,'Password is incorrect.');
      if(ctx.user.role==='admin'&&repository.adminCount()<=1) throw new HttpError(400,'You are the only admin. Promote another admin first.');
      return tx(()=>{repository.deleteUser(ctx.user.id);audit(null,'privacy.account_deleted',`user #${ctx.user.id}`,ctx.ip);return{ok:true};});
    },
  };
}
module.exports = { createProfilesService };

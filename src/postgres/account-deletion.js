'use strict';

function createPostgresAccountDeletion({reporting,verifyCurrentPassword,deleteAuthUser}){
  if(!reporting||typeof reporting.prepareAccountDeletion!=='function')throw new TypeError('Administrator reporting repository is required.');
  if(typeof verifyCurrentPassword!=='function'||typeof deleteAuthUser!=='function')throw new TypeError('Password verification and Auth deletion dependencies are required.');
  return Object.freeze({async deleteOwn(ctx,password){
    const session=ctx&&ctx.session;if(!session?.identity?.authUser?.id)throw Object.assign(new Error('Please sign in again.'),{status:401});
    if(!await verifyCurrentPassword(session,String(password||'')))throw Object.assign(new Error('Password is incorrect.'),{status:400});
    const prepared=await reporting.prepareAccountDeletion({authUserId:session.identity.authUser.id,verified:true},ctx.ip||'');
    try{await deleteAuthUser(prepared.authUserId);}catch{throw Object.assign(new Error('Account deletion could not be completed. No retry was attempted automatically.'),{status:503});}
    return{ok:true};
  }});
}
function createSupabaseAccountDeletion({reporting,bridge}){
  if(!bridge)throw new TypeError('Supabase Auth bridge is required.');
  return createPostgresAccountDeletion({reporting,verifyCurrentPassword:bridge.verifyCurrentPassword,deleteAuthUser:bridge.deleteAuthUser});
}
module.exports={createPostgresAccountDeletion,createSupabaseAccountDeletion};

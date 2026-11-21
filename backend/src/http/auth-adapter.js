'use strict';
function createAuthAdapter({runtime,service,setCookie,sessionMaxAge}){return{
 register(ctx,input){if(runtime.mode==='supabase')return runtime.bridge.register(input,ctx.res);const token=service.register(ctx,input);setCookie(ctx.res,ctx.req,token,sessionMaxAge);return{ok:true};},
 login(ctx,email,password){if(runtime.mode==='supabase')return runtime.bridge.login(email,password,ctx.res);const token=service.login(ctx,email,password);setCookie(ctx.res,ctx.req,token,sessionMaxAge);return{ok:true};},
 logout(ctx){if(runtime.mode==='supabase')return runtime.bridge.logout(ctx.session,ctx.res);service.logout(ctx);setCookie(ctx.res,ctx.req,'',0);return{ok:true};},
 clear(ctx){if(runtime.mode==='supabase')return runtime.bridge.clear(ctx.res);setCookie(ctx.res,ctx.req,'',0);},mode:()=>runtime.mode,bridge:runtime.bridge,service,
};}
module.exports={createAuthAdapter};

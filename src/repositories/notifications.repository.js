'use strict';
function createNotificationsRepository({all,get,run,categorySql}) { const where=`user_id=? AND (?='all' OR (?='unread' AND read_at IS NULL) OR (?='read' AND read_at IS NOT NULL)) AND (?='all' OR ${categorySql}=?)`; return {
  unread:(u)=>get('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL',u).n,
  preview:(u)=>all(`SELECT id,text,link,read_at,created_at,${categorySql} category FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 5`,u),
  total:(args)=>get(`SELECT COUNT(*) n FROM notifications WHERE ${where}`,...args).n,
  page:(args,limit,offset)=>all(`SELECT id,text,link,read_at,created_at,${categorySql} category FROM notifications WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,...args,limit,offset),
  counts:(u)=>all(`SELECT ${categorySql} category,COUNT(*) n FROM notifications WHERE user_id=? GROUP BY category`,u),
  markOne:(u,id,at)=>run('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?',at,id,u),
  markAll:(u,at)=>run('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',at,u),
}; }
module.exports={createNotificationsRepository};

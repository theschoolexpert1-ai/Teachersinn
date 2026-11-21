'use strict';
function createTutorialsRepository({all,get,run}) { return {
  list:(u)=>all(`SELECT t.id,t.title,t.category,t.summary,t.minutes,COALESCE(v.saved,0) saved,v.viewed_at FROM tutorials t LEFT JOIN tutorial_views v ON v.tutorial_id=t.id AND v.user_id=? ORDER BY t.category,t.id`,u),
  find:(id)=>get('SELECT * FROM tutorials WHERE id=?',id), view:(u,id)=>run(`INSERT INTO tutorial_views (user_id,tutorial_id) VALUES (?,?) ON CONFLICT(user_id,tutorial_id) DO UPDATE SET viewed_at=datetime('now')`,u,id),
  saved:(u,id)=>get('SELECT saved FROM tutorial_views WHERE user_id=? AND tutorial_id=?',u,id),related:(c,id)=>all('SELECT id,title,minutes FROM tutorials WHERE category=? AND id<>? LIMIT 4',c,id),
  toggle:(u,id)=>run(`INSERT INTO tutorial_views (user_id,tutorial_id,saved) VALUES (?,?,1) ON CONFLICT(user_id,tutorial_id) DO UPDATE SET saved=1-saved`,u,id),
}; }
module.exports={createTutorialsRepository};

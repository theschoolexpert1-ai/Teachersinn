'use strict';
function createLessonPlansRepository({all,get,run}) { return {
  overview:(u)=>({total:get('SELECT COUNT(*) n FROM lesson_plans WHERE user_id=?',u).n,upcoming:get("SELECT COUNT(*) n FROM lesson_plans WHERE user_id=? AND plan_date>=date('now')",u).n,undated:get("SELECT COUNT(*) n FROM lesson_plans WHERE user_id=? AND plan_date=''",u).n,thisWeek:get("SELECT COUNT(*) n FROM lesson_plans WHERE user_id=? AND plan_date BETWEEN date('now') AND date('now','+6 days')",u).n}),
  list(u,x){return all(`SELECT * FROM lesson_plans WHERE user_id=? AND (?='' OR title LIKE ? OR subject LIKE ? OR grade LIKE ? OR objectives LIKE ? OR activities LIKE ? OR assessment LIKE ?) AND (?='' OR subject LIKE ?) AND (?='' OR grade LIKE ?) AND (?='all' OR (?='upcoming' AND plan_date>=date('now')) OR (?='past' AND plan_date<>'' AND plan_date<date('now')) OR (?='undated' AND plan_date='')) ORDER BY COALESCE(NULLIF(plan_date,''),'9999') ASC,id DESC`,u,x.q,`%${x.q}%`,`%${x.q}%`,`%${x.q}%`,`%${x.q}%`,`%${x.q}%`,`%${x.q}%`,x.subject,`%${x.subject}%`,x.grade,`%${x.grade}%`,x.scope,x.scope,x.scope,x.scope);},
  find:(u,id)=>get('SELECT * FROM lesson_plans WHERE id=? AND user_id=?',id,u),
  duplicate(u,f){return get(`SELECT id FROM lesson_plans WHERE user_id=? AND title=? AND subject=? AND grade=? AND plan_date=? AND duration_min=? AND objectives=? AND materials=? AND activities=? AND assessment=? AND reflection=? AND created_at>=datetime('now','-10 seconds') ORDER BY id DESC LIMIT 1`,u,...Object.values(f));},
  create(u,f){return run(`INSERT INTO lesson_plans (user_id,title,subject,grade,plan_date,duration_min,objectives,materials,activities,assessment,reflection) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,u,...Object.values(f));},
  update(u,id,f){return run(`UPDATE lesson_plans SET title=?,subject=?,grade=?,plan_date=?,duration_min=?,objectives=?,materials=?,activities=?,assessment=?,reflection=?,updated_at=datetime('now') WHERE id=? AND user_id=?`,...Object.values(f),id,u);},
  delete:(u,id)=>run('DELETE FROM lesson_plans WHERE id=? AND user_id=?',id,u),
}; }
module.exports={createLessonPlansRepository};

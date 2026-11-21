'use strict';

function createDashboardRepository({ all, get }) {
  return {
    courseCpd(userId) { return get(`SELECT COALESCE(SUM(c.cpd_hours),0) h FROM enrollments e JOIN courses c ON c.id=e.course_id
      WHERE e.user_id=? AND e.completed_at IS NOT NULL AND e.completed_at >= date('now','start of year')`, userId).h; },
    workshopCpd(userId, now) { return get(`SELECT COALESCE(SUM(w.cpd_hours),0) h FROM workshop_regs r JOIN workshops w ON w.id=r.workshop_id
      WHERE r.user_id=? AND r.attended=1 AND w.starts_at < ? AND w.starts_at >= strftime('%Y-01-01','now')`, userId, now).h; },
    learning(userId) { return all(`SELECT c.id, c.title, c.category,
        (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id) total,
        (SELECT COUNT(*) FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id=c.id AND p.user_id=?) done
      FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? AND e.completed_at IS NULL ORDER BY e.enrolled_at DESC LIMIT 4`, userId, userId); },
    weekly(userId) { return all(`SELECT strftime('%Y-%W', done_at) wk, COUNT(*) n FROM lesson_progress
      WHERE user_id=? AND done_at >= date('now','-56 days') GROUP BY wk`, userId); },
    scalar(sql, ...params) { return get(sql, ...params).n; },
    upcoming(userId, now) { return all(`SELECT w.id,w.title,w.starts_at,w.mode,w.facilitator,
        EXISTS(SELECT 1 FROM workshop_regs r WHERE r.workshop_id=w.id AND r.user_id=?) registered
      FROM workshops w WHERE w.starts_at>=? ORDER BY w.starts_at LIMIT 3`, userId, now); },
    todayPlans(userId) { return all("SELECT id,title,subject,grade,plan_date FROM lesson_plans WHERE user_id=? AND plan_date>=date('now') ORDER BY plan_date LIMIT 3", userId); },
    discussions() { return all(`SELECT p.id,p.title,p.created_at,c.name community,u.name author,
      (SELECT COUNT(*) FROM replies r WHERE r.post_id=p.id) replies
      FROM posts p JOIN communities c ON c.id=p.community_id JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 4`); },
    notifications(userId) { return all('SELECT id,text,link,read_at,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 6', userId); },
  };
}

module.exports = { createDashboardRepository };

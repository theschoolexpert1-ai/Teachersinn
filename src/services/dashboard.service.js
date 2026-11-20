'use strict';

function sqliteWeek(date) {
  const year = date.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const yearDay = Math.floor((date - jan1) / 86400000);
  const weekDay = (date.getUTCDay() + 6) % 7;
  return `${year}-${String(Math.floor((yearDay + 7 - weekDay) / 7)).padStart(2, '0')}`;
}

function createDashboardService({ repository, nowIso, nowMs = Date.now, cpdGoal }) {
  return {
    overview(userId) {
      const now = nowIso();
      const courses = repository.courseCpd(userId);
      const workshops = repository.workshopCpd(userId, now);
      const weeks = repository.weekly(userId);
      const activity = [];
      for (let i = 7; i >= 0; i -= 1) {
        const date = new Date(nowMs() - i * 7 * 86400000);
        const week = sqliteWeek(date);
        activity.push({ label: date.toISOString().slice(5, 10), n: (weeks.find((row) => row.wk === week) || {}).n || 0 });
      }
      const n = repository.scalar;
      return {
        stats: {
          enrolled: n('SELECT COUNT(*) n FROM enrollments WHERE user_id=?', userId),
          completed: n('SELECT COUNT(*) n FROM enrollments WHERE user_id=? AND completed_at IS NOT NULL', userId),
          workshops: n('SELECT COUNT(*) n FROM workshop_regs r JOIN workshops w ON w.id=r.workshop_id WHERE r.user_id=? AND w.starts_at>=?', userId, now),
          connections: n("SELECT COUNT(*) n FROM connections WHERE status='accepted' AND (requester_id=? OR addressee_id=?)", userId, userId),
          pendingRequests: n("SELECT COUNT(*) n FROM connections WHERE status='pending' AND addressee_id=?", userId),
          unreadMessages: n('SELECT COUNT(*) n FROM messages WHERE recipient_id=? AND read_at IS NULL', userId),
          openTickets: n("SELECT COUNT(*) n FROM tickets WHERE user_id=? AND status IN ('open','in_progress')", userId),
          plans: n('SELECT COUNT(*) n FROM lesson_plans WHERE user_id=?', userId),
        },
        cpd: { courses, workshops, total: courses + workshops, goal: cpdGoal },
        learning: repository.learning(userId), activity,
        upcoming: repository.upcoming(userId, now), todayPlans: repository.todayPlans(userId),
        discussions: repository.discussions(), notifications: repository.notifications(userId),
      };
    },
  };
}

module.exports = { createDashboardService, sqliteWeek };

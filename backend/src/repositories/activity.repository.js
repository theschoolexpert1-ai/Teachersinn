'use strict';

function createActivityRepository({ get, run }) {
  return {
    audit(userId, action, detail, ip) {
      return run('INSERT INTO audit_log (user_id, action, detail, ip) VALUES (?,?,?,?)', userId ?? null, action, String(detail || '').slice(0, 500), ip || null);
    },
    notificationPreference(userId, category) {
      return get(`SELECT ${category} enabled FROM notification_preferences WHERE user_id=?`, userId)?.enabled;
    },
    notify(userId, text, link) {
      return run('INSERT INTO notifications (user_id, text, link) VALUES (?,?,?)', userId, text.slice(0, 300), link);
    },
  };
}

module.exports = { createActivityRepository };

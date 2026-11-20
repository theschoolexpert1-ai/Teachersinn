'use strict';

function createProfilesRepository({ all, get, run }) {
  return {
    update(userId, fields) {
      return run(`UPDATE users SET name=?,designation=?,school=?,subjects=?,grades=?,board=?,city=?,state=?,bio=?,experience_years=?,open_to_mentor=?,directory_visible=? WHERE id=?`,
        fields.name,fields.designation,fields.school,fields.subjects,fields.grades,fields.board,fields.city,fields.state,fields.bio,fields.experience_years,fields.open_to_mentor,fields.directory_visible,userId);
    },
    adminCount: () => get("SELECT COUNT(*) n FROM users WHERE role='admin'").n,
    deleteUser: (userId) => run('DELETE FROM users WHERE id=?', userId),
    exportData(userId) {
      return {
        enrollments: all('SELECT c.title, e.enrolled_at, e.completed_at, e.certificate_code FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=?', userId),
        workshops: all('SELECT w.title, w.starts_at, r.registered_at FROM workshop_regs r JOIN workshops w ON w.id=r.workshop_id WHERE r.user_id=?', userId),
        connections: all(`SELECT u.name, c.status, c.created_at FROM connections c JOIN users u ON u.id = CASE WHEN c.requester_id=? THEN c.addressee_id ELSE c.requester_id END WHERE c.requester_id=? OR c.addressee_id=?`,userId,userId,userId),
        messages_sent: all('SELECT recipient_id, body, created_at FROM messages WHERE sender_id=?', userId),
        posts: all('SELECT title, body, created_at FROM posts WHERE user_id=?', userId),
        replies: all('SELECT body, created_at FROM replies WHERE user_id=?', userId),
        tickets: all('SELECT subject, body, status, created_at FROM tickets WHERE user_id=?', userId),
        lesson_plans: all('SELECT * FROM lesson_plans WHERE user_id=?', userId),
        activity_log: all('SELECT action, ip, created_at FROM audit_log WHERE user_id=? ORDER BY id DESC LIMIT 500', userId),
      };
    },
  };
}
module.exports = { createProfilesRepository };

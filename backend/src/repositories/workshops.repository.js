'use strict';

function createWorkshopsRepository({ all, get, run }) {
  return {
    listForUser(userId) { return all(`SELECT w.*,(SELECT COUNT(*) FROM workshop_regs r WHERE r.workshop_id=w.id) registered_count,
      EXISTS(SELECT 1 FROM workshop_regs r WHERE r.workshop_id=w.id AND r.user_id=?) registered,
      (SELECT r.attended FROM workshop_regs r WHERE r.workshop_id=w.id AND r.user_id=?) attended,
      (SELECT r.registered_at FROM workshop_regs r WHERE r.workshop_id=w.id AND r.user_id=?) registered_at,
      (SELECT r.attendance_status FROM workshop_regs r WHERE r.workshop_id=w.id AND r.user_id=?) attendance_status,
      (SELECT r.attendance_verified_at FROM workshop_regs r WHERE r.workshop_id=w.id AND r.user_id=?) attendance_verified_at
      FROM workshops w ORDER BY w.starts_at`, userId,userId,userId,userId,userId); },
    find: (id) => get('SELECT * FROM workshops WHERE id=?', id),
    create: (values) => run(`INSERT INTO workshops (title,description,facilitator,category,mode,location,starts_at,duration_min,capacity,cpd_hours,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,...values),
    adminList: () => all(`SELECT w.id,w.title,w.starts_at,w.duration_min,w.mode,w.location,w.cpd_hours,
      COUNT(r.user_id) registrations,
      COALESCE(SUM(CASE WHEN r.attendance_status='pending' THEN 1 ELSE 0 END),0) pending,
      COALESCE(SUM(CASE WHEN r.attendance_status='attended' THEN 1 ELSE 0 END),0) attended,
      COALESCE(SUM(CASE WHEN r.attendance_status='absent' THEN 1 ELSE 0 END),0) absent
      FROM workshops w LEFT JOIN workshop_regs r ON r.workshop_id=w.id GROUP BY w.id ORDER BY w.starts_at DESC`),
    registrations(workshopId,status,search) { const like=`%${search}%`; return all(`SELECT r.user_id registration_id,r.registered_at,r.attendance_status,r.attendance_verified_at,
      u.name,u.email,w.id workshop_id,w.title workshop_title,w.starts_at,w.duration_min,w.cpd_hours
      FROM workshop_regs r JOIN users u ON u.id=r.user_id JOIN workshops w ON w.id=r.workshop_id
      WHERE r.workshop_id=? AND (?='' OR r.attendance_status=?) AND (?='' OR u.name LIKE ? OR u.email LIKE ?)
      ORDER BY u.name COLLATE NOCASE`,workshopId,status,status,search,like,like); },
    registration: (userId, workshopId) => get('SELECT * FROM workshop_regs WHERE user_id=? AND workshop_id=?', userId, workshopId),
    registrationCount: (workshopId) => get('SELECT COUNT(*) n FROM workshop_regs WHERE workshop_id=?', workshopId).n,
    register: (userId, workshopId) => run('INSERT OR IGNORE INTO workshop_regs (user_id, workshop_id) VALUES (?,?)', userId, workshopId),
    cancel: (userId, workshopId) => run('DELETE FROM workshop_regs WHERE user_id=? AND workshop_id=?', userId, workshopId),
    updateAttendance(workshopId,userId,status,verifiedAt,verifiedBy) { return run(`UPDATE workshop_regs SET attended=?,attendance_status=?,attendance_verified_at=?,attendance_verified_by=? WHERE workshop_id=? AND user_id=?`,status==='attended'?1:0,status,verifiedAt,verifiedBy,workshopId,userId); },
    registrants: (workshopId) => all('SELECT user_id FROM workshop_regs WHERE workshop_id=?', workshopId),
    delete: (workshopId) => run('DELETE FROM workshops WHERE id=?', workshopId),
  };
}
module.exports = { createWorkshopsRepository };

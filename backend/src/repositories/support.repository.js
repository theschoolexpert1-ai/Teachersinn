'use strict';
function createSupportRepository({all,get,run}) { return {
  list:(u)=>all('SELECT * FROM tickets WHERE user_id=? ORDER BY updated_at DESC',u),
  create:(u,c,s,b)=>run('INSERT INTO tickets (user_id,category,subject,body) VALUES (?,?,?,?)',u,c,s,b),
  ticket:(id)=>get('SELECT t.*, u.name requester FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.id=?',id),
  replies:(id)=>all(`SELECT r.id,r.body,r.created_at,COALESCE(u.name,'Deleted user') author,u.role FROM ticket_replies r LEFT JOIN users u ON u.id=r.user_id WHERE r.ticket_id=? ORDER BY r.id`,id),
  addReply:(id,u,b)=>run('INSERT INTO ticket_replies (ticket_id,user_id,body) VALUES (?,?,?)',id,u,b),
  updateReplyState:(id,status,at)=>run('UPDATE tickets SET updated_at=?, status=? WHERE id=?',at,status,id),
  updateAdmin:(id,status,priority,at)=>run('UPDATE tickets SET status=?, priority=?, updated_at=? WHERE id=?',status,priority,at,id),
}; }
module.exports={createSupportRepository};

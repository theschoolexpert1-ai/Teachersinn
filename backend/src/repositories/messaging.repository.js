'use strict';

function createMessagingRepository({ all, get, run, publicUserColumns = 'id,name,role,designation,school,subjects,grades,board,city,state,bio,experience_years,open_to_mentor' }) {
  return {
    directory(userId,{like,subject,city,view}) { const columns=publicUserColumns.split(',').map(c=>'u.'+c).join(',');return all(`SELECT ${columns},
      (SELECT id FROM connections c WHERE (c.requester_id=? AND c.addressee_id=u.id) OR (c.addressee_id=? AND c.requester_id=u.id)) connection_id,
      (SELECT status FROM connections c WHERE (c.requester_id=? AND c.addressee_id=u.id) OR (c.addressee_id=? AND c.requester_id=u.id)) connection_status,
      (SELECT CASE WHEN requester_id=? THEN 'out' ELSE 'in' END FROM connections c WHERE (c.requester_id=? AND c.addressee_id=u.id) OR (c.addressee_id=? AND c.requester_id=u.id)) direction
      FROM users u WHERE u.status='active' AND u.directory_visible=1 AND u.id<>?
      AND (u.name LIKE ? OR u.subjects LIKE ? OR u.city LIKE ? OR u.state LIKE ? OR u.school LIKE ? OR u.designation LIKE ?)
      AND (?='' OR u.subjects LIKE ?) AND (?='' OR u.city LIKE ?)
      AND (?='all' OR EXISTS (SELECT 1 FROM connections f WHERE ((f.requester_id=? AND f.addressee_id=u.id) OR (f.addressee_id=? AND f.requester_id=u.id)) AND ((?='connections' AND f.status='accepted') OR (?='sent' AND f.status='pending' AND f.requester_id=?) OR (?='received' AND f.status='pending' AND f.addressee_id=?))))
      ORDER BY u.open_to_mentor DESC,u.experience_years DESC,u.name LIMIT 100`,userId,userId,userId,userId,userId,userId,userId,userId,like,like,like,like,like,like,subject,`%${subject}%`,city,`%${city}%`,view,userId,userId,view,view,userId,view,userId); },
    directoryVisible:(id)=>!!get('SELECT directory_visible FROM users WHERE id=?',id)?.directory_visible,
    profileConnection:(userId,otherId)=>get(`SELECT id connection_id,status,CASE WHEN requester_id=? THEN 'out' ELSE 'in' END direction FROM connections WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`,userId,userId,otherId,otherId,userId),
    connectionLists(userId){const cols='c.id connection_id,c.status,c.created_at,u.id,u.name,u.designation,u.school,u.subjects,u.city';return{accepted:all(`SELECT ${cols} FROM connections c JOIN users u ON u.id=CASE WHEN c.requester_id=? THEN c.addressee_id ELSE c.requester_id END WHERE c.status='accepted' AND (c.requester_id=? OR c.addressee_id=?) AND u.status='active' ORDER BY u.name`,userId,userId,userId),incoming:all(`SELECT ${cols} FROM connections c JOIN users u ON u.id=c.requester_id WHERE c.status='pending' AND c.addressee_id=? ORDER BY c.created_at DESC`,userId),outgoing:all(`SELECT ${cols} FROM connections c JOIN users u ON u.id=c.addressee_id WHERE c.status='pending' AND c.requester_id=? ORDER BY c.created_at DESC`,userId)};},
    findConnectionBetween(a, b) {
      return get('SELECT * FROM connections WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)', a, b, b, a);
    },
    findPendingIncoming: (connectionId, userId) => get('SELECT * FROM connections WHERE id=? AND addressee_id=? AND status=?', connectionId, userId, 'pending'),
    findConnection: (connectionId) => get('SELECT * FROM connections WHERE id=?', connectionId),
    insertConnection: (requesterId, addresseeId) => run('INSERT INTO connections (requester_id, addressee_id) VALUES (?,?)', requesterId, addresseeId),
    updateConnectionStatus: (connectionId, status) => run('UPDATE connections SET status=? WHERE id=?', status, connectionId),
    retryConnection: (connectionId) => run("UPDATE connections SET status='pending', created_at=datetime('now') WHERE id=?", connectionId),
    deleteConnection: (connectionId) => run('DELETE FROM connections WHERE id=?', connectionId),
    canMessage(a, b) {
      return !!get("SELECT 1 FROM connections WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))", a, b, b, a)
        || !!get("SELECT 1 FROM mentorships WHERE status='active' AND ((mentee_id=? AND mentor_id=?) OR (mentee_id=? AND mentor_id=?))", a, b, b, a);
    },
    listConversations(userId) {
      return all(`SELECT other.id, other.name, other.designation, m.body last_body, m.created_at last_at,
          (SELECT COUNT(*) FROM messages x WHERE x.sender_id=other.id AND x.recipient_id=? AND x.read_at IS NULL) unread
        FROM (SELECT CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END other_id, MAX(id) mid FROM messages
              WHERE sender_id=? OR recipient_id=? GROUP BY other_id) t
        JOIN messages m ON m.id=t.mid JOIN users other ON other.id=t.other_id ORDER BY m.id DESC`, userId, userId, userId, userId);
    },
    markConversationRead: (senderId, recipientId, readAt) => run('UPDATE messages SET read_at=? WHERE sender_id=? AND recipient_id=? AND read_at IS NULL', readAt, senderId, recipientId),
    listMessages(a, b) {
      return all(`SELECT id, sender_id, body, created_at FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY id DESC LIMIT 200`, a, b, b, a).reverse();
    },
    insertMessage: (senderId, recipientId, body) => run('INSERT INTO messages (sender_id, recipient_id, body) VALUES (?,?,?)', senderId, recipientId, body),
  };
}

module.exports = { createMessagingRepository };

'use strict';
function createCommunityRepository({all,get,run}) { return {
  communities:()=>all(`SELECT c.*,(SELECT COUNT(*) FROM posts p WHERE p.community_id=c.id) posts,(SELECT MAX(p.created_at) FROM posts p WHERE p.community_id=c.id) last_post FROM communities c ORDER BY c.id`),
  community:(id)=>get('SELECT * FROM communities WHERE id=?',id), post:(id)=>get('SELECT * FROM posts WHERE id=?',id), reply:(id)=>get('SELECT * FROM replies WHERE id=?',id),
  discussions({communityId,mine,userId,q,order}) { const like=`%${q}%`; return all(`SELECT p.id,p.community_id,p.user_id,p.title,p.body,p.created_at,c.name community,c.icon,u.name author,u.designation,
      (SELECT COUNT(*) FROM replies r WHERE r.post_id=p.id) replies,
      COALESCE((SELECT MAX(r.created_at) FROM replies r WHERE r.post_id=p.id),p.created_at) last_activity
    FROM posts p JOIN communities c ON c.id=p.community_id JOIN users u ON u.id=p.user_id
    WHERE (?=0 OR p.community_id=?) AND (?=0 OR p.user_id=?)
      AND (?='' OR p.title LIKE ? OR p.body LIKE ? OR c.name LIKE ? OR u.name LIKE ?)
    ORDER BY ${order} LIMIT 150`,communityId,communityId,mine,userId,q,like,like,like,like); },
  communityPosts(id) { return all(`SELECT p.id,p.user_id,p.title,p.body,p.created_at,u.id author_id,u.name author,u.designation,
      (SELECT COUNT(*) FROM replies r WHERE r.post_id=p.id) replies,
      COALESCE((SELECT MAX(r.created_at) FROM replies r WHERE r.post_id=p.id),p.created_at) last_activity
      FROM posts p JOIN users u ON u.id=p.user_id WHERE p.community_id=? ORDER BY p.id DESC LIMIT 100`,id); },
  postDetail:(id)=>get(`SELECT p.*, u.name author, u.designation, c.name community FROM posts p JOIN users u ON u.id=p.user_id JOIN communities c ON c.id=p.community_id WHERE p.id=?`,id),
  replies:(postId)=>all('SELECT r.id,r.body,r.created_at,r.user_id,u.name author,u.designation FROM replies r JOIN users u ON u.id=r.user_id WHERE r.post_id=? ORDER BY r.id',postId),
  duplicatePost:(c,u,t,b)=>get(`SELECT id FROM posts WHERE community_id=? AND user_id=? AND title=? AND body=? AND created_at>=datetime('now','-10 seconds') ORDER BY id DESC LIMIT 1`,c,u,t,b),
  createPost:(c,u,t,b)=>run('INSERT INTO posts (community_id,user_id,title,body) VALUES (?,?,?,?)',c,u,t,b),
  duplicateReply:(p,u,b)=>get(`SELECT id FROM replies WHERE post_id=? AND user_id=? AND body=? AND created_at>=datetime('now','-10 seconds') ORDER BY id DESC LIMIT 1`,p,u,b),
  createReply:(p,u,b)=>run('INSERT INTO replies (post_id,user_id,body) VALUES (?,?,?)',p,u,b),
  deleteReply:(id)=>run('DELETE FROM replies WHERE id=?',id), deletePost:(id)=>run('DELETE FROM posts WHERE id=?',id),
}; }
module.exports={createCommunityRepository};

'use strict';
function createMentorshipRepository({all,get,run}) { return {
  mentors:(u,cols)=>all(`SELECT ${cols} FROM users WHERE status='active' AND open_to_mentor=1 AND id<>? ORDER BY experience_years DESC`,u),
  list:(u)=>all(`SELECT m.*, a.name mentee_name, b.name mentor_name FROM mentorships m JOIN users a ON a.id=m.mentee_id JOIN users b ON b.id=m.mentor_id WHERE m.mentee_id=? OR m.mentor_id=? ORDER BY m.id DESC`,u,u),
  mentor:(id)=>get('SELECT * FROM users WHERE id=? AND open_to_mentor=1 AND status=?',id,'active'),
  duplicate:(mentee,mentor)=>get("SELECT 1 FROM mentorships WHERE mentee_id=? AND mentor_id=? AND status IN ('requested','active')",mentee,mentor),
  create:(mentee,mentor,topic,message)=>run('INSERT INTO mentorships (mentee_id,mentor_id,topic,message) VALUES (?,?,?,?)',mentee,mentor,topic,message),
  forMentor:(id,mentor)=>get('SELECT * FROM mentorships WHERE id=? AND mentor_id=?',id,mentor),
  update:(id,status)=>run('UPDATE mentorships SET status=? WHERE id=?',status,id),
}; }
module.exports={createMentorshipRepository};

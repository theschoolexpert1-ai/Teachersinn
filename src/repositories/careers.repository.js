'use strict';
function createCareersRepository({all,get,run}) { return {
  careerProfile:(u)=>get('SELECT * FROM career_profiles WHERE user_id=?',u),
  careerUser:(u)=>get('SELECT name,designation,school,city,subjects,grades,board,bio,experience_years FROM users WHERE id=?',u),
  fullCareerUser:(u)=>get('SELECT name,email,designation,school,city,state,subjects,grades,board,bio,experience_years FROM users WHERE id=?',u),
  applicationCount:(u,status='')=>get(`SELECT COUNT(*) n FROM job_applications WHERE user_id=?${status?' AND status=?':''}`,u,...(status?[status]:[])).n,
  saveProfile(u,f,at){return run(`INSERT INTO career_profiles (user_id,professional_summary,previous_institutions,responsibilities,qualifications,certifications,training,skills,specializations,cv_template,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET professional_summary=excluded.professional_summary,previous_institutions=excluded.previous_institutions,responsibilities=excluded.responsibilities,qualifications=excluded.qualifications,certifications=excluded.certifications,training=excluded.training,skills=excluded.skills,specializations=excluded.specializations,cv_template=excluded.cv_template,updated_at=excluded.updated_at`,u,f.professional_summary,f.previous_institutions,f.responsibilities,f.qualifications,f.certifications,f.training,f.skills,f.specializations,f.cv_template,at);},
  jobs(u,x){return all(`SELECT j.*,EXISTS(SELECT 1 FROM job_applications a WHERE a.job_id=j.id AND a.user_id=?) applied,(SELECT status FROM job_applications a WHERE a.job_id=j.id AND a.user_id=?) application_status FROM jobs j WHERE j.status='open' AND (?='' OR j.title LIKE ? OR j.school LIKE ? OR j.subject LIKE ? OR j.city LIKE ?) AND (?='' OR j.subject LIKE ?) AND (?='' OR j.city LIKE ?) AND (?='' OR j.job_type=?) AND (?=0 OR EXISTS(SELECT 1 FROM job_applications a WHERE a.job_id=j.id AND a.user_id=?)) ORDER BY j.id DESC`,u,u,x.q,`%${x.q}%`,`%${x.q}%`,`%${x.q}%`,`%${x.q}%`,x.subject,`%${x.subject}%`,x.city,`%${x.city}%`,x.type,x.type,x.applied,u);},
  jobDetail:(u,id)=>get(`SELECT j.*,EXISTS(SELECT 1 FROM job_applications a WHERE a.job_id=j.id AND a.user_id=?) applied,(SELECT status FROM job_applications a WHERE a.job_id=j.id AND a.user_id=?) application_status FROM jobs j WHERE j.id=?`,u,u,id),
  job:(id)=>get('SELECT id,title,status FROM jobs WHERE id=?',id), application:(u,j)=>get('SELECT 1 FROM job_applications WHERE user_id=? AND job_id=?',u,j),
  apply:(u,j)=>run('INSERT INTO job_applications (user_id,job_id) VALUES (?,?)',u,j),
  applications:(u)=>all(`SELECT a.id,a.status,a.applied_at,a.updated_at,j.id job_id,j.title,j.school,j.city,j.job_type,j.subject,j.status job_status FROM job_applications a JOIN jobs j ON j.id=a.job_id WHERE a.user_id=? ORDER BY a.id DESC`,u),
}; }
module.exports={createCareersRepository};

'use strict';
function createSettingsRepository({get,run}) { return {
  hasCareerProfile:(u)=>!!get('SELECT 1 FROM career_profiles WHERE user_id=?',u),
  preferences:(u)=>get('SELECT messages,connections,community,workshops,learning,mentorship,support FROM notification_preferences WHERE user_id=?',u),
  savePreferences(userId,keys,values){return run(`INSERT INTO notification_preferences (user_id,${keys.join(',')},updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET ${keys.map(k=>`${k}=excluded.${k}`).join(',')},updated_at=datetime('now')`,userId,...values);},
}; }
module.exports={createSettingsRepository};

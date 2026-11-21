'use strict';

module.exports = {
  version: '0001',
  name: 'initial_schema',
  sql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'educator' CHECK (role IN ('educator','mentor','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  designation TEXT DEFAULT '', school TEXT DEFAULT '', subjects TEXT DEFAULT '', grades TEXT DEFAULT '',
  board TEXT DEFAULT '', city TEXT DEFAULT '', state TEXT DEFAULT '', bio TEXT DEFAULT '',
  experience_years INTEGER DEFAULT 0, open_to_mentor INTEGER DEFAULT 0, directory_visible INTEGER DEFAULT 1,
  consent_at TEXT NOT NULL, consent_version TEXT NOT NULL DEFAULT '1.0',
  failed_logins INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL, ip TEXT, user_agent TEXT, created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL,
  detail TEXT DEFAULT '', ip TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'Beginner', summary TEXT NOT NULL, instructor TEXT NOT NULL,
  cpd_hours INTEGER NOT NULL DEFAULT 1, published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 10
);
CREATE TABLE enrollments (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT, certificate_code TEXT UNIQUE,
  PRIMARY KEY (user_id, course_id)
);
CREATE TABLE lesson_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  done_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, lesson_id)
);
CREATE TABLE workshops (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL,
  facilitator TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Pedagogy',
  mode TEXT NOT NULL DEFAULT 'Online' CHECK (mode IN ('Online','In-person','Hybrid')),
  location TEXT DEFAULT '', starts_at TEXT NOT NULL, duration_min INTEGER NOT NULL DEFAULT 90,
  capacity INTEGER NOT NULL DEFAULT 50, cpd_hours INTEGER NOT NULL DEFAULT 2,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE workshop_regs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workshop_id INTEGER NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')), attended INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, workshop_id)
);
CREATE TABLE connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (requester_id, addressee_id)
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
  read_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_messages_pair ON messages(sender_id, recipient_id);
CREATE TABLE communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '✎'
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL,
  body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE mentorships (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mentee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, topic TEXT NOT NULL, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','active','declined','completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE tutorials (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL,
  summary TEXT NOT NULL, steps TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 5
);
CREATE TABLE tutorial_views (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tutorial_id INTEGER NOT NULL REFERENCES tutorials(id) ON DELETE CASCADE,
  saved INTEGER NOT NULL DEFAULT 0, viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, tutorial_id)
);
CREATE TABLE lesson_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, subject TEXT DEFAULT '', grade TEXT DEFAULT '', plan_date TEXT DEFAULT '',
  duration_min INTEGER DEFAULT 40, objectives TEXT DEFAULT '', materials TEXT DEFAULT '',
  activities TEXT DEFAULT '', assessment TEXT DEFAULT '', reflection TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, school TEXT NOT NULL, city TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'Full-time', subject TEXT DEFAULT '', description TEXT NOT NULL,
  apply_email TEXT NOT NULL, posted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE career_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  professional_summary TEXT DEFAULT '', previous_institutions TEXT DEFAULT '', responsibilities TEXT DEFAULT '',
  qualifications TEXT DEFAULT '', certifications TEXT DEFAULT '', training TEXT DEFAULT '', skills TEXT DEFAULT '',
  specializations TEXT DEFAULT '', cv_template TEXT NOT NULL DEFAULT 'classic' CHECK (cv_template IN ('classic','modern')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE job_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status='applied'),
  applied_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, job_id)
);
CREATE INDEX idx_job_applications_user ON job_applications(user_id, applied_at DESC);
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL, link TEXT DEFAULT '', read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user_read_created ON notifications(user_id, read_at, created_at DESC, id DESC);
CREATE TABLE notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  messages INTEGER NOT NULL DEFAULT 1 CHECK(messages IN (0,1)),
  connections INTEGER NOT NULL DEFAULT 1 CHECK(connections IN (0,1)),
  community INTEGER NOT NULL DEFAULT 1 CHECK(community IN (0,1)),
  workshops INTEGER NOT NULL DEFAULT 1 CHECK(workshops IN (0,1)),
  learning INTEGER NOT NULL DEFAULT 1 CHECK(learning IN (0,1)),
  mentorship INTEGER NOT NULL DEFAULT 1 CHECK(mentorship IN (0,1)),
  support INTEGER NOT NULL DEFAULT 1 CHECK(support IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
};

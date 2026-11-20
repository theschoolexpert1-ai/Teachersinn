'use strict';

module.exports = {
  version: '0004',
  name: 'course_management',
  sql: `
ALTER TABLE courses ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE courses ADD COLUMN thumbnail TEXT NOT NULL DEFAULT '';
ALTER TABLE courses ADD COLUMN objectives TEXT NOT NULL DEFAULT '';
ALTER TABLE courses ADD COLUMN prerequisites TEXT NOT NULL DEFAULT '';
ALTER TABLE courses ADD COLUMN estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0);
ALTER TABLE courses ADD COLUMN status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('draft','published','archived'));
ALTER TABLE courses ADD COLUMN updated_at TEXT;
UPDATE courses SET status=CASE WHEN published=1 THEN 'published' ELSE 'draft' END,
  description=summary,
  estimated_minutes=COALESCE((SELECT SUM(minutes) FROM lessons WHERE lessons.course_id=courses.id),0),
  updated_at=created_at;
CREATE INDEX idx_courses_status_created ON courses(status, created_at DESC);
CREATE UNIQUE INDEX idx_lessons_course_position_unique ON lessons(course_id, position);
`,
};

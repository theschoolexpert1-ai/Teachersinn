'use strict';

module.exports = {
  version: '0003',
  name: 'query_performance_indexes',
  sql: `
CREATE INDEX idx_lessons_course_position ON lessons(course_id, position);
CREATE INDEX idx_enrollments_course_user ON enrollments(course_id, user_id);
CREATE INDEX idx_lesson_progress_user_done ON lesson_progress(user_id, done_at DESC);
CREATE INDEX idx_workshop_regs_workshop_status_user ON workshop_regs(workshop_id, attendance_status, user_id);
CREATE INDEX idx_connections_addressee_status_created ON connections(addressee_id, status, created_at DESC);
CREATE INDEX idx_connections_requester_status_created ON connections(requester_id, status, created_at DESC);
CREATE INDEX idx_messages_recipient_id ON messages(recipient_id, id DESC);
CREATE INDEX idx_posts_community_id ON posts(community_id, id DESC);
CREATE INDEX idx_replies_post_id ON replies(post_id, id);
CREATE INDEX idx_tickets_user_updated ON tickets(user_id, updated_at DESC, id DESC);
CREATE INDEX idx_ticket_replies_ticket_id ON ticket_replies(ticket_id, id);
CREATE INDEX idx_mentorships_mentee_status ON mentorships(mentee_id, status, id DESC);
CREATE INDEX idx_mentorships_mentor_status ON mentorships(mentor_id, status, id DESC);
CREATE INDEX idx_lesson_plans_user_date ON lesson_plans(user_id, plan_date, id DESC);
CREATE INDEX idx_job_applications_job_user ON job_applications(job_id, user_id);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC, id DESC);
CREATE INDEX idx_audit_user_id ON audit_log(user_id, id DESC);
`,
};

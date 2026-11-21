'use strict';

module.exports = {
  version: '0002',
  name: 'workshop_attendance_verification',
  sql: `
ALTER TABLE workshop_regs ADD COLUMN attendance_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (attendance_status IN ('pending','attended','absent'));
UPDATE workshop_regs SET attendance_status=CASE WHEN attended=1 THEN 'attended' ELSE 'pending' END;
ALTER TABLE workshop_regs ADD COLUMN attendance_verified_at TEXT;
ALTER TABLE workshop_regs ADD COLUMN attendance_verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
`,
};

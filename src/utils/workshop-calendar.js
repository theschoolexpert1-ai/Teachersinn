'use strict';

function formatCalendarDate(date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function escapeCalendar(value) { return String(value).replace(/[\\;,]/g, (match) => `\\${match}`).replace(/\r?\n/g, '\\n'); }

function workshopCalendar(workshop, generatedAt = new Date()) {
  const start = new Date(workshop.starts_at);
  const end = new Date(start.getTime() + workshop.duration_min * 60000);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TeachersInn//Workshops//EN', 'BEGIN:VEVENT',
    `UID:workshop-${workshop.id}@teachersinn`, `DTSTAMP:${formatCalendarDate(generatedAt)}`,
    `DTSTART:${formatCalendarDate(start)}`, `DTEND:${formatCalendarDate(end)}`,
    `SUMMARY:${escapeCalendar(workshop.title)}`,
    `DESCRIPTION:${escapeCalendar(`${workshop.description} — Facilitator: ${workshop.facilitator}`)}`,
    `LOCATION:${escapeCalendar(workshop.location)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

module.exports = { workshopCalendar };

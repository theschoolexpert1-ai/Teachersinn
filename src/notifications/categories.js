'use strict';

const OPTIONAL_CATEGORIES = ['messages','connections','community','workshops','learning','mentorship','support'];
const FILTER_CATEGORIES = ['all','messages','connections','community','workshops','learning','support','system'];
const CATEGORY_SQL = `CASE
  WHEN link LIKE '#/messages/%' THEN 'messages'
  WHEN link LIKE '#/network%' THEN 'connections'
  WHEN link LIKE '#/post/%' OR link LIKE '#/community%' THEN 'community'
  WHEN link LIKE '#/workshops%' THEN 'workshops'
  WHEN link LIKE '#/course/%' OR link LIKE '#/learn%' OR link LIKE '#/certificate/%' THEN 'learning'
  WHEN link LIKE '#/ticket/%' OR link LIKE '#/support%' THEN 'support'
  ELSE 'system' END`;

function categoryFor(link, explicit = '') {
  if (OPTIONAL_CATEGORIES.includes(explicit)) return explicit;
  const value = String(link);
  if (value.startsWith('#/messages/')) return 'messages';
  if (value.startsWith('#/network')) return 'connections';
  if (value.startsWith('#/post/') || value.startsWith('#/community')) return 'community';
  if (value.startsWith('#/workshop')) return 'workshops';
  if (/^#\/(learn|course|certificate)/.test(value)) return 'learning';
  if (/^#\/(support|ticket)/.test(value)) return 'support';
  return '';
}

module.exports = { OPTIONAL_CATEGORIES, FILTER_CATEGORIES, CATEGORY_SQL, categoryFor };

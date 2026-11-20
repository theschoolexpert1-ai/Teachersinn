'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { verifiedIdentity } = require('./integration');

const requests = new AsyncLocalStorage();

function runWithPostgresIdentity(session, work) {
  if (typeof work !== 'function') throw new TypeError('Request work is required.');
  const identity = verifiedIdentity(session);
  return requests.run(Object.freeze({ identity }), work);
}

function currentPostgresIdentity() {
  const store = requests.getStore();
  if (!store) throw Object.assign(new Error('Verified PostgreSQL request identity is unavailable.'), { status: 401 });
  return store.identity;
}

function assertOwnIdentity(value) {
  const identity = currentPostgresIdentity();
  if (value !== undefined && value !== null && String(value) !== identity.authUserId) {
    throw Object.assign(new Error('Request identity does not match the verified session.'), { status: 403 });
  }
  return identity;
}

module.exports = { runWithPostgresIdentity, currentPostgresIdentity, assertOwnIdentity };

'use strict';

function defineRepositoryContract(name, methods) {
  if (!name || !Array.isArray(methods) || methods.length === 0) throw new TypeError('Repository contracts require a name and methods.');
  const required = Object.freeze([...new Set(methods)]);
  return Object.freeze({
    name,
    methods: required,
    validate(repository) {
      if (!repository || typeof repository !== 'object') throw new TypeError(`${name} repository is required.`);
      const missing = required.filter((method) => typeof repository[method] !== 'function');
      if (missing.length) throw new TypeError(`${name} repository is missing: ${missing.join(', ')}.`);
      return repository;
    },
  });
}

/**
 * Incremental async boundary. It preserves current synchronous SQLite methods
 * while allowing converted services to await PostgreSQL implementations.
 */
async function invokeRepository(contract, repository, method, ...args) {
  contract.validate(repository);
  if (!contract.methods.includes(method)) throw new TypeError(`${method} is not part of the ${contract.name} repository contract.`);
  return repository[method](...args);
}

module.exports = { defineRepositoryContract, invokeRepository };

'use strict';

const { postgresConfig } = require('./config');
const { createPostgresConnection } = require('./connection');
const { DatabaseError, mapDatabaseError } = require('./errors');
const repositories = require('./repositories');
const integration = require('./integration');
const httpContext = require('./http-context');
const httpServices = require('./http-services');
const httpHarness = require('./http-harness');
const accountDeletion = require('./account-deletion');
const httpRoutes = require('./http-routes');

module.exports = { postgresConfig, createPostgresConnection, DatabaseError, mapDatabaseError, ...repositories, ...integration, ...httpContext, ...httpServices, ...httpHarness, ...accountDeletion, ...httpRoutes };

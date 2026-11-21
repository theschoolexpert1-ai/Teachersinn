'use strict';

module.exports = {
  ...require('./user.repository'),
  ...require('./learning.repository'),
  ...require('./admin-learning.repository'),
  ...require('./workshops.repository'),
  ...require('./admin-workshops.repository'),
  ...require('./jobs.repository'),
  ...require('./admin-jobs.repository'),
  ...require('./teacher-discovery.repository'),
  ...require('./connections.repository'),
  ...require('./messaging.repository'),
  ...require('./community.repository'),
  ...require('./notifications.repository'),
  ...require('./admin-community.repository'),
  ...require('./mentorship.repository'),
  ...require('./support.repository'),
  ...require('./tutorials.repository'),
  ...require('./lesson-plans.repository'),
  ...require('./dashboard.repository'),
  ...require('./admin-reporting.repository'),
};

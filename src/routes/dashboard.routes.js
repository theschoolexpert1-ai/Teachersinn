'use strict';

function registerDashboardRoutes({ route, dashboardService }) {
  route('GET','/api/dashboard','user',(ctx)=>dashboardService.overview(ctx.user.id));
}

module.exports = { registerDashboardRoutes };

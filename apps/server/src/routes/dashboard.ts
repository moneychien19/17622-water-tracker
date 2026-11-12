import { currentUser } from '../auth/hook';
import { ctxOf } from '../services/context';
import { getDashboard } from '../services/dashboard.service';
import type { RouteModule } from './index';

export const dashboardRoutes: RouteModule = (app) => {
  const ctx = ctxOf(app);
  app.get('/api/dashboard', async (req) => getDashboard(ctx, currentUser(req).id));
};

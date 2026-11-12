import { currentUser } from '../auth/hook';
import { optionalQuery, param } from '../lib/params';
import { ctxOf } from '../services/context';
import { recordWatering, undoWatering, wateringHistory } from '../services/waterings.service';
import type { RouteModule } from './index';

export const wateringRoutes: RouteModule = (app) => {
  const ctx = ctxOf(app);

  // The server sets wateredAt; any client-supplied body is ignored.
  app.post('/api/plants/:plantId/waterings', async (req, reply) => {
    const result = await recordWatering(ctx, currentUser(req).id, param(req.params, 'plantId'));
    return reply.status(201).send(result);
  });

  app.post('/api/waterings/:id/undo', async (req) => ({
    plant: await undoWatering(ctx, currentUser(req).id, param(req.params, 'id')),
  }));

  app.get('/api/plants/:plantId/waterings', async (req) =>
    wateringHistory(
      ctx,
      currentUser(req).id,
      param(req.params, 'plantId'),
      optionalQuery(req.query, 'cursor'),
    ),
  );
};

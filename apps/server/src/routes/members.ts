import { currentUser } from '../auth/hook';
import { param } from '../lib/params';
import { ctxOf } from '../services/context';
import { listMembers, removeMember } from '../services/members.service';
import type { RouteModule } from './index';

export const memberRoutes: RouteModule = (app) => {
  const ctx = ctxOf(app);

  app.get('/api/groups/:groupId/members', async (req) => ({
    members: await listMembers(ctx, currentUser(req).id, param(req.params, 'groupId')),
  }));

  app.delete('/api/groups/:groupId/members/:userId', async (req, reply) => {
    await removeMember(
      ctx,
      currentUser(req).id,
      param(req.params, 'groupId'),
      param(req.params, 'userId'),
    );
    return reply.status(204).send();
  });
};

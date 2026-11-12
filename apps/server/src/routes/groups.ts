import { CreateGroupBodySchema, UpdateGroupBodySchema } from '@water/shared';
import { currentUser } from '../auth/hook';
import { param } from '../lib/params';
import { parseBody } from '../lib/validate';
import { ctxOf } from '../services/context';
import {
  createGroup,
  deleteGroup,
  listGroupsForUser,
  renameGroup,
} from '../services/groups.service';
import type { RouteModule } from './index';

export const groupRoutes: RouteModule = (app) => {
  const ctx = ctxOf(app);

  app.get('/api/groups', async (req) => ({
    groups: await listGroupsForUser(ctx, currentUser(req).id),
  }));

  app.post('/api/groups', async (req, reply) => {
    const body = parseBody(CreateGroupBodySchema, req.body);
    const group = await createGroup(ctx, currentUser(req).id, body);
    return reply.status(201).send({ group });
  });

  app.patch('/api/groups/:groupId', async (req) => {
    const body = parseBody(UpdateGroupBodySchema, req.body);
    const group = await renameGroup(ctx, currentUser(req).id, param(req.params, 'groupId'), body);
    return { group };
  });

  app.delete('/api/groups/:groupId', async (req, reply) => {
    await deleteGroup(ctx, currentUser(req).id, param(req.params, 'groupId'));
    return reply.status(204).send();
  });
};

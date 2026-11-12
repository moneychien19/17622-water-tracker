import { CreateInvitationBodySchema } from '@water/shared';
import { currentUser } from '../auth/hook';
import { param } from '../lib/params';
import { parseBody } from '../lib/validate';
import { ctxOf } from '../services/context';
import {
  acceptInvitation,
  createInvitation,
  declineInvitation,
  listGroupInvitations,
  listMyInvitations,
  revokeInvitation,
} from '../services/invitations.service';
import type { RouteModule } from './index';

export const invitationRoutes: RouteModule = (app) => {
  const ctx = ctxOf(app);

  app.get('/api/groups/:groupId/invitations', async (req) => ({
    invitations: await listGroupInvitations(ctx, currentUser(req).id, param(req.params, 'groupId')),
  }));

  app.post('/api/groups/:groupId/invitations', async (req, reply) => {
    const { email } = parseBody(CreateInvitationBodySchema, req.body);
    const invitation = await createInvitation(
      ctx,
      currentUser(req).id,
      param(req.params, 'groupId'),
      email,
    );
    return reply.status(201).send({ invitation });
  });

  app.delete('/api/invitations/:id', async (req, reply) => {
    await revokeInvitation(ctx, currentUser(req).id, param(req.params, 'id'));
    return reply.status(204).send();
  });

  app.get('/api/me/invitations', async (req) => ({
    invitations: await listMyInvitations(ctx, currentUser(req).email),
  }));

  app.post('/api/invitations/:id/accept', async (req) => ({
    group: await acceptInvitation(ctx, currentUser(req), param(req.params, 'id')),
  }));

  app.post('/api/invitations/:id/decline', async (req, reply) => {
    await declineInvitation(ctx, currentUser(req), param(req.params, 'id'));
    return reply.status(204).send();
  });
};

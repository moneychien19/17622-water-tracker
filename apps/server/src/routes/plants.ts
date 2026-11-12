import { CreatePlantBodySchema, UpdatePlantBodySchema } from '@water/shared';
import { currentUser } from '../auth/hook';
import { param } from '../lib/params';
import { parseBody } from '../lib/validate';
import { ctxOf } from '../services/context';
import { createPlant, deletePlant, getPlant, updatePlant } from '../services/plants.service';
import type { RouteModule } from './index';

export const plantRoutes: RouteModule = (app) => {
  const ctx = ctxOf(app);

  app.post('/api/groups/:groupId/plants', async (req, reply) => {
    const body = parseBody(CreatePlantBodySchema, req.body);
    const plant = await createPlant(ctx, currentUser(req).id, param(req.params, 'groupId'), body);
    return reply.status(201).send({ plant });
  });

  app.get('/api/plants/:plantId', async (req) => ({
    plant: await getPlant(ctx, currentUser(req).id, param(req.params, 'plantId')),
  }));

  app.patch('/api/plants/:plantId', async (req) => {
    const body = parseBody(UpdatePlantBodySchema, req.body);
    return {
      plant: await updatePlant(ctx, currentUser(req).id, param(req.params, 'plantId'), body),
    };
  });

  app.delete('/api/plants/:plantId', async (req, reply) => {
    await deletePlant(ctx, currentUser(req).id, param(req.params, 'plantId'));
    return reply.status(204).send();
  });
};

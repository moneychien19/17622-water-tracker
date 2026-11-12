import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { dashboardRoutes } from './dashboard';
import { groupRoutes } from './groups';
import { invitationRoutes } from './invitations';
import { memberRoutes } from './members';
import { plantRoutes } from './plants';
import { wateringRoutes } from './waterings';

export interface RouteOptions {
  /** Max register/login attempts per IP per minute. */
  authRateLimit: number;
}

export type RouteModule = (app: FastifyInstance, opts: RouteOptions) => void;

export const allRoutes: RouteModule[] = [
  authRoutes,
  dashboardRoutes,
  groupRoutes,
  invitationRoutes,
  memberRoutes,
  plantRoutes,
  wateringRoutes,
];

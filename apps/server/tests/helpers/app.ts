import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { RegisterBody, User } from '@water/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { inject } from 'vitest';
import { buildApp } from '../../src/app';
import { createPrisma } from '../../src/db';
import { RecordingEmitter, type RealtimeEmitter } from '../../src/realtime/emitter';

export interface TestClock {
  now: () => Date;
  set: (d: Date) => void;
  advance: (ms: number) => void;
  /** Return to following the real clock. */
  real: () => void;
}

export function createClock(): TestClock {
  let fixed: Date | null = null;
  return {
    now: () => (fixed ? new Date(fixed) : new Date()),
    set: (d) => {
      fixed = new Date(d);
    },
    advance: (ms) => {
      fixed = new Date((fixed ?? new Date()).getTime() + ms);
    },
    real: () => {
      fixed = null;
    },
  };
}

export interface TestApp {
  app: FastifyInstance;
  prisma: PrismaClient;
  emitter: RecordingEmitter;
  clock: TestClock;
  teardown: () => Promise<void>;
}

export interface TestDb {
  prisma: PrismaClient;
  dir: string;
  cleanup: () => Promise<void>;
}

export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'water-db-'));
  const dbPath = join(dir, 'test.db');
  copyFileSync(inject('templateDbPath'), dbPath);
  const prisma = createPrisma(`file:${dbPath}`);
  return {
    prisma,
    dir,
    cleanup: async () => {
      await prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function setupTestApp(
  options: { authRateLimit?: number; emitter?: RealtimeEmitter } = {},
): Promise<TestApp> {
  const db = createTestDb();
  const emitter = new RecordingEmitter();
  const clock = createClock();
  const app = await buildApp({
    prisma: db.prisma,
    emitter: options.emitter ?? emitter,
    now: clock.now,
    authRateLimit: options.authRateLimit ?? 10_000,
  });
  await app.ready();
  return {
    app,
    prisma: db.prisma,
    emitter,
    clock,
    teardown: async () => {
      await app.close();
      await db.cleanup();
    },
  };
}

/** Extract `sid=...` from a Set-Cookie header for reuse in later requests. */
export function sessionCookieFrom(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const sid = list.find((c) => c.startsWith('sid='));
  if (!sid) throw new Error(`No sid cookie in response (status ${res.statusCode})`);
  return sid.split(';')[0] ?? '';
}

export interface LoggedInUser {
  user: User;
  cookie: string;
}

export async function createUserAndLogin(
  app: FastifyInstance,
  overrides: Partial<RegisterBody> = {},
): Promise<LoggedInUser> {
  const body: RegisterBody = {
    email: `user-${randomUUID()}@example.com`,
    password: 'correct horse battery',
    displayName: 'Test User',
    timeZone: 'America/New_York',
    ...overrides,
  };
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: body });
  if (res.statusCode !== 201) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const json = res.json<{ user: User }>();
  return { user: json.user, cookie: sessionCookieFrom(res) };
}

/** Typed JSON helper for app.inject. */
export async function call(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  options: { cookie?: string; payload?: object } = {},
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    headers: options.cookie ? { cookie: options.cookie } : {},
    ...(options.payload !== undefined ? { payload: options.payload } : {}),
  });
}

/** The id of the user's auto-created personal group. */
export async function personalGroupId(prisma: PrismaClient, userId: string): Promise<string> {
  const m = await prisma.membership.findFirstOrThrow({
    where: { userId, group: { isPersonal: true } },
  });
  return m.groupId;
}

/** Create a non-personal group owned by the user (bypasses the API). */
export async function createSharedGroup(
  prisma: PrismaClient,
  ownerId: string,
  name = 'Balcony',
): Promise<string> {
  const g = await prisma.group.create({
    data: { name, memberships: { create: { userId: ownerId, role: 'owner' } } },
  });
  return g.id;
}

/** Add a membership directly (bypasses invitations). */
export async function addMember(
  prisma: PrismaClient,
  groupId: string,
  userId: string,
  role: 'owner' | 'caretaker' = 'caretaker',
): Promise<void> {
  await prisma.membership.create({ data: { groupId, userId, role } });
}

export interface PlantJson {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  intervalDays: number;
  location: 'inside' | 'outside';
  notes: string | null;
  version: number;
  nextDueAt: string;
  lastWatering: { id: string; at: string; byUserId: string; byDisplayName: string } | null;
}

export async function createPlantViaApi(
  app: FastifyInstance,
  cookie: string,
  groupId: string,
  body: Partial<{
    name: string;
    intervalDays: number;
    location: 'inside' | 'outside';
    notes: string | null;
    lastWateredAt: string;
  }> = {},
): Promise<PlantJson> {
  const res = await call(app, 'POST', `/api/groups/${groupId}/plants`, {
    cookie,
    payload: { name: 'Fern', intervalDays: 3, location: 'inside', ...body },
  });
  if (res.statusCode !== 201) throw new Error(`create plant failed: ${res.statusCode} ${res.body}`);
  return res.json<{ plant: PlantJson }>().plant;
}

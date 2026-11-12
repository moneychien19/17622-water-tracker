import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';

export const SESSION_COOKIE = 'sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Only extend expiry when less than this much lifetime has passed, to avoid a write per request. */
const EXTEND_AFTER_MS = 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  now: Date,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
  });
  return token;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  timeZone: string;
}

export async function validateSession(
  prisma: PrismaClient,
  token: string | undefined,
  now: Date,
): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: {
      user: { select: { id: true, email: true, displayName: true, timeZone: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= now.getTime()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.expiresAt.getTime() - now.getTime() < SESSION_TTL_MS - EXTEND_AFTER_MS) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: { expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
      })
      .catch(() => undefined);
  }
  return session.user;
}

export async function destroySession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  void reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  void reply.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}

/** Parse the sid cookie out of a raw Cookie header (used by the Socket.IO handshake). */
export function readSidFromCookieHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

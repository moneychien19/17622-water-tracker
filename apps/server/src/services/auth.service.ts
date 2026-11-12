import { Prisma } from '@prisma/client';
import type { LoginBody, RegisterBody, User } from '@water/shared';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { ConflictError, UnauthorizedError } from '../lib/errors';
import type { ServiceContext } from './context';

export const PERSONAL_GROUP_NAME = 'My Plants';
const INVALID_CREDENTIALS = 'Invalid email or password';

/** Hash of a random password, verified when the email is unknown so timing does not leak. */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('dummy-password-for-timing');
  return dummyHashPromise;
}

const publicUser = { id: true, email: true, displayName: true, timeZone: true } as const;

export async function register(ctx: ServiceContext, body: RegisterBody): Promise<User> {
  const passwordHash = await hashPassword(body.password);
  try {
    return await ctx.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email,
          displayName: body.displayName,
          timeZone: body.timeZone,
          passwordHash,
        },
        select: publicUser,
      });
      await tx.group.create({
        data: {
          name: PERSONAL_GROUP_NAME,
          isPersonal: true,
          memberships: { create: { userId: user.id, role: 'owner' } },
        },
      });
      return user;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('An account with this email already exists');
    }
    throw err;
  }
}

export async function login(ctx: ServiceContext, body: LoginBody): Promise<User> {
  const found = await ctx.prisma.user.findUnique({ where: { email: body.email } });
  const ok = await verifyPassword(found?.passwordHash ?? (await dummyHash()), body.password);
  if (!found || !ok) throw new UnauthorizedError(INVALID_CREDENTIALS);
  return {
    id: found.id,
    email: found.email,
    displayName: found.displayName,
    timeZone: found.timeZone,
  };
}

import { PrismaClient } from '@prisma/client';

export type { PrismaClient };

export function createPrisma(url?: string): PrismaClient {
  return url === undefined ? new PrismaClient() : new PrismaClient({ datasourceUrl: url });
}

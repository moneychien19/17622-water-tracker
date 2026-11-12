import { existsSync } from 'node:fs';
import { z } from 'zod';

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env && existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  return ConfigSchema.parse(env);
}

import { existsSync, readFileSync } from 'node:fs';
import { runtimePaths } from './paths';

export type AppConfig = {
  nodeEnv: string;
  port: number;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dbPrefix: string;
  jwtSecret: string;
  jwtTtl: number;
  appUrl: string;
  corsOrigin: string;
  requirePublicAppUrl: boolean;
  storageDriver: string;
  s3Endpoint: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Region: string;
  s3PublicUrl: string;
  adminDistDir: string;
  uploadDir: string;
  contentDir: string;
};

function loadEnvFile(path = '.env') {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!value || process.env[key]) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function env(key: string, fallback = '') {
  const value = process.env[key];
  return value && value.length > 0 ? value : fallback;
}

function envInt(key: string, fallback: number) {
  const parsed = Number.parseInt(env(key), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(key: string, fallback = false) {
  const value = env(key, fallback ? 'true' : 'false').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

loadEnvFile();

function tablePrefix() {
  const prefix = env('DB_PREFIX', 'ul_');
  if (prefix && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(prefix)) {
    throw new Error(`Invalid DB_PREFIX: ${prefix}`);
  }
  return prefix;
}

export const config: AppConfig = {
  nodeEnv: env('NODE_ENV', env('BUN_ENV', 'development')),
  port: envInt('PORT', 8080),
  dbHost: env('DB_HOST', 'localhost'),
  dbPort: envInt('DB_PORT', 5432),
  dbName: env('DB_NAME', 'utterlog'),
  dbUser: env('DB_USER', ''),
  dbPassword: env('DB_PASSWORD', ''),
  dbPrefix: tablePrefix(),
  jwtSecret: env('JWT_SECRET', ''),
  jwtTtl: envInt('JWT_TTL', 86400),
  appUrl: env('APP_URL', 'http://localhost:8080'),
  corsOrigin: env('CORS_ORIGIN', ''),
  requirePublicAppUrl: envBool('REQUIRE_PUBLIC_APP_URL', false),
  storageDriver: env('STORAGE_DRIVER', 'local'),
  s3Endpoint: env('S3_ENDPOINT', ''),
  s3Bucket: env('S3_BUCKET', ''),
  s3AccessKey: env('S3_ACCESS_KEY', ''),
  s3SecretKey: env('S3_SECRET_KEY', ''),
  s3Region: env('S3_REGION', 'auto'),
  s3PublicUrl: env('S3_PUBLIC_URL', ''),
  adminDistDir: runtimePaths.adminDistDir,
  uploadDir: env('UPLOAD_DIR', 'uploads'),
  contentDir: env('CONTENT_DIR', 'content'),
};

export function table(name: string) {
  return `${config.dbPrefix}${name}`;
}

export function assertSecureConfig(dbReady: boolean) {
  if (!dbReady) return;
  if (!config.jwtSecret || config.jwtSecret === 'change-this-secret-key') {
    throw new Error('JWT_SECRET must be set to a private random value before running with database access.');
  }
  if (config.nodeEnv === 'production') {
    if (!/^https?:\/\//.test(config.appUrl)) {
      throw new Error('APP_URL must be an absolute public URL in production.');
    }
    const appHost = new URL(config.appUrl).hostname;
    if (config.requirePublicAppUrl && ['localhost', '127.0.0.1', '0.0.0.0'].includes(appHost)) {
      throw new Error('APP_URL must not use localhost in production.');
    }
    if (config.corsOrigin.trim() === '*') {
      throw new Error('CORS_ORIGIN=* is not allowed in production. Use APP_URL or an explicit origin list.');
    }
  }
}

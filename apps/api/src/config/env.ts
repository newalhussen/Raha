import * as fs from 'fs';
import * as path from 'path';

/**
 * Typed environment. Loads `apps/api/.env` (if present) without needing dotenv, then validates.
 * Production refuses to boot on development secrets.
 */
export interface Env {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  pinEncKey: Buffer;
  fileSigningSecret: string;
  storageDir: string;
  publicWebUrl: string;
  publicApiUrl: string;
  corsOrigins: string[];
  smsProvider: 'console' | 'none';
  telegramBotToken: string | null;
  otpDevEcho: boolean;
}

const DEV_JWT = 'dev-only-jwt-secret-change-me';
const DEV_FILE = 'dev-only-file-signing-secret';
const DEV_PIN_KEY = 'ZGV2LW9ubHktcGluLWtleS0zMi1ieXRlcy1sb25nISE=';

function loadDotEnv(): void {
  const candidates = [path.resolve(process.cwd(), '.env'), path.resolve(__dirname, '../../.env')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      const key = m[1]!;
      let value = m[2]!;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
    return;
  }
}

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  loadDotEnv();
  const e = process.env;
  const nodeEnv = (e.NODE_ENV as Env['nodeEnv']) || 'development';
  const isProduction = nodeEnv === 'production';

  const pinEncKey = Buffer.from(e.PIN_ENC_KEY || DEV_PIN_KEY, 'base64');
  if (pinEncKey.length !== 32) throw new Error('PIN_ENC_KEY must be 32 bytes, base64-encoded');

  const env: Env = {
    nodeEnv,
    isProduction,
    port: Number(e.PORT || 4000),
    databaseUrl: e.DATABASE_URL || 'postgres://raha:raha_dev@localhost:5433/raha',
    jwtSecret: e.JWT_SECRET || DEV_JWT,
    accessTokenTtlSeconds: Number(e.ACCESS_TOKEN_TTL_SECONDS || 900),
    refreshTokenTtlDays: Number(e.REFRESH_TOKEN_TTL_DAYS || 30),
    pinEncKey,
    fileSigningSecret: e.FILE_SIGNING_SECRET || DEV_FILE,
    storageDir: path.resolve(process.cwd(), e.STORAGE_DIR || './storage'),
    publicWebUrl: (e.PUBLIC_WEB_URL || 'http://localhost:3000').replace(/\/$/, ''),
    publicApiUrl: (e.PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, ''),
    corsOrigins: (e.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',').map((s) => s.trim()).filter(Boolean),
    smsProvider: (e.SMS_PROVIDER as Env['smsProvider']) || 'console',
    telegramBotToken: e.TELEGRAM_BOT_TOKEN || null,
    otpDevEcho: (e.OTP_DEV_ECHO ?? (isProduction ? 'false' : 'true')) === 'true',
  };

  if (isProduction) {
    const problems: string[] = [];
    if (env.jwtSecret === DEV_JWT || env.jwtSecret.length < 32) problems.push('JWT_SECRET must be set to a strong secret (>= 32 chars)');
    if (env.fileSigningSecret === DEV_FILE) problems.push('FILE_SIGNING_SECRET must be set');
    if ((e.PIN_ENC_KEY || DEV_PIN_KEY) === DEV_PIN_KEY) problems.push('PIN_ENC_KEY must be set');
    if (env.otpDevEcho) problems.push('OTP_DEV_ECHO must be false');
    if (problems.length) throw new Error(`Refusing to start in production:\n - ${problems.join('\n - ')}`);
  }

  cached = env;
  return env;
}

/** Test helper: forget the cached env after mutating process.env. */
export function resetEnvForTests(): void {
  cached = null;
}

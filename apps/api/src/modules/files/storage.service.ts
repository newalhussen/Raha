import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { loadEnv } from '../../config/env';
import { hmacHex, safeEqualHex } from '../../common/crypto';
import { badRequest } from '../../common/errors';

export const ALLOWED_UPLOADS = {
  'image/jpeg': { ext: 'jpg', magic: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b: Buffer) => b.subarray(0, 4).toString('hex') === '89504e47' },
  'image/webp': { ext: 'webp', magic: (b: Buffer) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  'application/pdf': { ext: 'pdf', magic: (b: Buffer) => b.subarray(0, 4).toString('latin1') === '%PDF' },
} as const;

export type AllowedMime = keyof typeof ALLOWED_UPLOADS;
const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

/**
 * File storage for proof photos and verification documents.
 * Local-disk driver today; the same four methods map 1:1 onto S3-compatible storage.
 * Files are never served from a public path — only through short-lived signed URLs.
 */
@Injectable()
export class StorageService {
  private readonly env = loadEnv();

  async save(buffer: Buffer, mime: string): Promise<{ key: string; bytes: number; contentType: string }> {
    const allowed = ALLOWED_UPLOADS[mime as AllowedMime];
    if (!allowed) throw badRequest('unsupported_file', 'Upload a JPG, PNG, WebP or PDF file');
    if (!allowed.magic(buffer)) throw badRequest('file_mismatch', 'The file contents do not match its type');
    const now = new Date();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${allowed.ext}`;
    const full = this.fullPath(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer, { mode: 0o640 });
    return { key, bytes: buffer.length, contentType: mime };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.fullPath(key));
      return true;
    } catch {
      return false;
    }
  }

  stream(key: string): { stream: fs.ReadStream; contentType: string } {
    const ext = path.extname(key).slice(1).toLowerCase();
    return { stream: fs.createReadStream(this.fullPath(key)), contentType: MIME_BY_EXT[ext] ?? 'application/octet-stream' };
  }

  /** URL valid for `ttlSeconds` (default 1 hour). */
  signUrl(key: string, ttlSeconds = 3600): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `${this.env.publicApiUrl}/api/v1/files/${key}?exp=${exp}&sig=${this.signature(key, exp)}`;
  }

  verifySignature(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    return /^[0-9a-f]{64}$/.test(sig) && safeEqualHex(sig, this.signature(key, exp));
  }

  private signature(key: string, exp: number): string {
    return hmacHex(this.env.fileSigningSecret, `${key}:${exp}`);
  }

  /** Resolve inside the storage dir only — blocks `..` traversal. */
  private fullPath(key: string): string {
    const root = path.resolve(this.env.storageDir);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw badRequest('bad_key', 'Invalid file key');
    return full;
  }
}

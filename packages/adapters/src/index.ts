import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Object storage for already-encrypted evidence bytes. Production: S3/R2 with SSE. */
export interface StorageAdapter {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const SAFE_KEY = /^[a-zA-Z0-9-]{8,80}$/;
const assertKey = (k: string) => { if (!SAFE_KEY.test(k)) throw new Error("Invalid storage key"); };

export class MemoryStorage implements StorageAdapter {
  readonly objects = new Map<string, Buffer>();
  async put(key: string, bytes: Buffer) { assertKey(key); this.objects.set(key, Buffer.from(bytes)); }
  async get(key: string) {
    assertKey(key);
    const b = this.objects.get(key);
    if (!b) throw new Error("Not found");
    return Buffer.from(b);
  }
  async delete(key: string) { assertKey(key); this.objects.delete(key); }
}

/** Local-development storage on disk. Not for production. */
export class LocalDiskStorage implements StorageAdapter {
  constructor(private readonly dir: string) {}
  private file(key: string) { assertKey(key); return path.join(this.dir, key); }
  async put(key: string, bytes: Buffer) { await mkdir(this.dir, { recursive: true }); await writeFile(this.file(key), bytes, { mode: 0o600 }); }
  async get(key: string) { return readFile(this.file(key)); }
  async delete(key: string) { await rm(this.file(key), { force: true }); }
}

export interface EmailMessage { to: string; subject: string; text: string }

/** Transactional email. Production: Resend/Postmark. */
export interface EmailAdapter {
  send(msg: EmailMessage): Promise<void>;
}

/** Records messages in memory (tests). */
export class MemoryEmail implements EmailAdapter {
  readonly outbox: EmailMessage[] = [];
  failNext = false;
  async send(msg: EmailMessage) {
    if (this.failNext) { this.failNext = false; throw new Error("send failed"); }
    this.outbox.push(msg);
  }
}

/** Development adapter: logs that a message was queued, never its recipient or content. */
export class ConsoleEmail implements EmailAdapter {
  async send(_msg: EmailMessage) { console.log("[mock-email] message queued"); }
}

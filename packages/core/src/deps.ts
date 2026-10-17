import type { PrismaClient } from "@privatepath/db";
import type { KmsAdapter } from "@privatepath/crypto";

export interface Deps {
  db: PrismaClient;
  kms: KmsAdapter;
  hashPepper: string;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export const TERMS_VERSION = "2026-10-draft-1";
export const PRIVACY_VERSION = "2026-10-draft-1";

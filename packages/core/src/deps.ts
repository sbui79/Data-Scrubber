import type { PrismaClient } from "@privatepath/db";
import type { KmsAdapter } from "@privatepath/crypto";
import type { EmailAdapter, StorageAdapter } from "@privatepath/adapters";

export interface Deps {
  db: PrismaClient;
  kms: KmsAdapter;
  hashPepper: string;
  /** Evidence file storage. Absent in contexts that do not handle files. */
  storage?: StorageAdapter;
  /** Transactional email. Absent: EMAIL reminders are delivered in-app only. */
  email?: EmailAdapter;
  /** Mock billing (records plans, takes no payment). Never enabled in production. */
  mockBilling?: boolean;
  /** Public base URL used in links inside emails. */
  appUrl?: string;
  /** Require an MFA-verified session for admin roles (always true outside local development). */
  requireAdminMfa?: boolean;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export const TERMS_VERSION = "2026-10-draft-1";
export const PRIVACY_VERSION = "2026-10-draft-1";

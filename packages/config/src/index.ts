import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  /** 32 bytes, base64. Local mock KMS only; production must use a real KMS. */
  MOCK_KMS_MASTER_KEY: z.string().optional(),
  HASH_PEPPER: z.string().min(16),
  AUTH_MODE: z.enum(["mock", "clerk"]).default("mock"),
  /** Shared secret for the scheduler that calls the reminder-delivery endpoint. Unset = endpoint disabled. */
  CRON_SECRET: z.string().min(32).optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  CLERK_SECRET_KEY: z.string().optional(),
  /** PEM public key for networkless token verification (alternative to CLERK_SECRET_KEY). */
  CLERK_JWT_KEY: z.string().optional(),
  /** Comma-separated app origins allowed in the token `azp` claim. Required in production. */
  CLERK_AUTHORIZED_PARTIES: z.string().optional(),
  FEATURE_MFA: z.coerce.boolean().default(false),
  FEATURE_FAMILY_MANAGER: z.coerce.boolean().default(false),
  FEATURE_EMAIL_SENDING: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const env = schema.safeParse(source);
  if (!env.success) {
    // Report variable names only, never values.
    const names = env.error.issues.map((i) => i.path.join("."));
    throw new Error(`Invalid environment: ${names.join(", ")}`);
  }
  if (env.data.NODE_ENV === "production" && env.data.MOCK_KMS_MASTER_KEY) {
    throw new Error("Invalid environment: MOCK_KMS_MASTER_KEY must not be set in production");
  }
  if (env.data.NODE_ENV === "production" && env.data.AUTH_MODE === "mock") {
    throw new Error("Invalid environment: AUTH_MODE=mock is not allowed in production");
  }
  if (env.data.AUTH_MODE === "clerk") {
    if (!env.data.CLERK_SECRET_KEY && !env.data.CLERK_JWT_KEY) throw new Error("Invalid environment: CLERK_SECRET_KEY, CLERK_JWT_KEY");
    if (env.data.NODE_ENV === "production" && !env.data.CLERK_AUTHORIZED_PARTIES) throw new Error("Invalid environment: CLERK_AUTHORIZED_PARTIES");
  }
  return env.data;
}

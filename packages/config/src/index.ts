import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  /** 32 bytes, base64. Local mock KMS only; production must use a real KMS. */
  MOCK_KMS_MASTER_KEY: z.string().optional(),
  HASH_PEPPER: z.string().min(16),
  CLERK_SECRET_KEY: z.string().optional(),
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
  return env.data;
}

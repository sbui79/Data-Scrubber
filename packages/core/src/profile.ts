import { randomUUID } from "node:crypto";
import { z } from "zod";
import { decryptField, encryptField, fieldAad } from "@privatepath/crypto";
import type { Prisma } from "@privatepath/db";
import type { Deps, RequestContext } from "./deps";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import type { Session } from "./auth";
import { getUserDek, requireUser } from "./users";

const short = z.string().trim().min(1).max(80);
const list = (item: z.ZodType<string>, max: number) => z.array(item).max(max);

/** Data minimization: only name is required; everything else is optional. */
export const ProfileInput = z.object({
  legalFirstName: short,
  legalLastName: short,
  aliases: list(short, 10).optional(),
  birthYearOrAgeRange: z.string().trim().max(20).optional(),
  currentCity: short.optional(),
  currentState: z.string().trim().min(2).max(40).optional(),
  previousLocations: list(short, 10).optional(),
  emailAddresses: list(z.string().email().max(120), 5).optional(),
  phoneNumbers: list(z.string().trim().min(7).max(20), 5).optional(),
});
export const ProfilePatch = ProfileInput.partial().extend({
  // null clears an optional field
  aliases: list(short, 10).nullable().optional(),
  birthYearOrAgeRange: z.string().trim().max(20).nullable().optional(),
  currentCity: short.nullable().optional(),
  currentState: z.string().trim().min(2).max(40).nullable().optional(),
  previousLocations: list(short, 10).nullable().optional(),
  emailAddresses: list(z.string().email().max(120), 5).nullable().optional(),
  phoneNumbers: list(z.string().trim().min(7).max(20), 5).nullable().optional(),
});

type Field = keyof z.infer<typeof ProfileInput>;
const COLUMN: Record<Field, string> = {
  legalFirstName: "encryptedLegalFirstName", legalLastName: "encryptedLegalLastName",
  aliases: "encryptedAliases", birthYearOrAgeRange: "encryptedBirthYearOrAgeRange",
  currentCity: "encryptedCurrentCity", currentState: "encryptedCurrentState",
  previousLocations: "encryptedPreviousLocations", emailAddresses: "encryptedEmailAddresses",
  phoneNumbers: "encryptedPhoneNumbers",
};

function seal(dek: Buffer, rowId: string, field: Field, value: unknown): Buffer {
  return encryptField(dek, JSON.stringify(value), fieldAad("UserProfile", COLUMN[field], rowId));
}

function open(dek: Buffer, rowId: string, field: Field, blob: Uint8Array | null): unknown {
  if (!blob) return null;
  return JSON.parse(decryptField(dek, Buffer.from(blob), fieldAad("UserProfile", COLUMN[field], rowId)));
}

function encryptAll(dek: Buffer, rowId: string, values: Partial<Record<Field, unknown>>): Prisma.UserProfileUncheckedUpdateInput {
  const out: Record<string, Uint8Array<ArrayBuffer> | null> = {};
  for (const [f, v] of Object.entries(values) as [Field, unknown][]) {
    out[COLUMN[f]] = v === null || v === undefined ? null : new Uint8Array(seal(dek, rowId, f, v));
  }
  return out as Prisma.UserProfileUncheckedUpdateInput;
}

export async function createProfile(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const input = ProfileInput.parse(raw);
  const user = await requireUser(deps, session);
  if (await deps.db.userProfile.findUnique({ where: { userId: user.id } })) {
    throw new AppError(409, "profile_exists", "A profile already exists. Use update instead.");
  }
  const dek = await getUserDek(deps, user.id);
  const id = randomUUID();
  await deps.db.$transaction(async (tx) => {
    await tx.userProfile.create({ data: { id, userId: user.id, ...encryptAll(dek, id, input) } as Prisma.UserProfileUncheckedCreateInput });
    await writeAudit(tx, deps, ctx, {
      actorUserId: user.id, targetUserId: user.id, eventType: "PROFILE_CREATED",
      entityType: "UserProfile", entityId: id, metadata: { fieldNames: Object.keys(input) },
    });
  });
  return getProfile(deps, session);
}

export async function getProfile(deps: Deps, session: Session) {
  const user = await requireUser(deps, session);
  const row = await deps.db.userProfile.findUnique({ where: { userId: user.id } });
  if (!row) throw new AppError(404, "profile_not_found", "No profile yet.");
  const dek = await getUserDek(deps, user.id);
  const o = (f: Field) => open(dek, row.id, f, ((row as unknown as Record<string, Uint8Array | null>)[COLUMN[f]] ?? null));
  return {
    nickname: user.displayName,
    legalFirstName: o("legalFirstName"), legalLastName: o("legalLastName"),
    aliases: o("aliases") ?? [], birthYearOrAgeRange: o("birthYearOrAgeRange"),
    currentCity: o("currentCity"), currentState: o("currentState"),
    previousLocations: o("previousLocations") ?? [], emailAddresses: o("emailAddresses") ?? [],
    phoneNumbers: o("phoneNumbers") ?? [], updatedAt: row.updatedAt,
  };
}

export async function updateProfile(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const patch = ProfilePatch.parse(raw);
  const user = await requireUser(deps, session);
  const row = await deps.db.userProfile.findUnique({ where: { userId: user.id } });
  if (!row) throw new AppError(404, "profile_not_found", "No profile yet.");
  const dek = await getUserDek(deps, user.id);
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await deps.db.$transaction(async (tx) => {
    await tx.userProfile.update({ where: { id: row.id }, data: encryptAll(dek, row.id, defined) });
    await writeAudit(tx, deps, ctx, {
      actorUserId: user.id, targetUserId: user.id, eventType: "PROFILE_UPDATED",
      entityType: "UserProfile", entityId: row.id, metadata: { fieldNames: Object.keys(defined) },
    });
  });
  return getProfile(deps, session);
}

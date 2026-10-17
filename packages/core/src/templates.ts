import { AppError } from "./errors";

export const TOKENS = ["full_name", "email", "user_email", "phone_last4", "listing_url", "date"] as const;
type Token = (typeof TOKENS)[number];

export const DATA_CATEGORIES = {
  name: "my name", old_addresses: "my current and previous addresses", phone: "my phone number",
  email: "my email address", relatives: "names of relatives associated with my record",
  profile_links: "links to my public profiles", property: "property records associated with me", other: "other personal details",
} as const;
export type DataCategory = keyof typeof DATA_CATEGORIES;

const ACTION = {
  OPT_OUT: "an opt-out", DELETION: "deletion", CORRECTION: "correction", SUPPRESSION: "removal or suppression",
  FOLLOW_UP: "an update on my earlier request for removal or suppression",
} as const;

/** Single-pass substitution. Unknown tokens throw; substituted values are never re-scanned. */
export function renderTemplate(template: string, values: Partial<Record<Token, string>>): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, name: string) => {
    if (!(TOKENS as readonly string[]).includes(name)) throw new AppError(400, "invalid_template", "The template contains an unknown field.");
    return values[name as Token] ?? "";
  });
}

const clean = (v: string) => v.replace(/[\r\n\t\u0000-\u001f]+/g, " ").trim();

export interface DraftOptions {
  requestType: keyof typeof ACTION;
  dataCategories: DataCategory[];
  fullName?: string;
  email?: string;
  phoneLast4?: string;
  listingUrl?: string | null;
  now?: Date;
}

/** Builds the draft. Optional personal details appear only when the caller passes them (user opted in). */
export function buildDraft(o: DraftOptions): { subject: string; body: string } {
  const lines = [
    "Hello,", "",
    `I am requesting ${ACTION[o.requestType]} of my personal information from your service. ` +
      (o.listingUrl ? "I am the individual associated with the listing at: {{listing_url}}." : "I am the individual making this request about my own information."),
  ];
  if (o.dataCategories.length) {
    lines.push("", "Information I am asking you to address: " + o.dataCategories.map((c) => DATA_CATEGORIES[c]).join(", ") + ".");
  }
  lines.push("", "Please process this request under your applicable privacy and opt-out procedures. Please confirm when the request has been completed.", "", "Thank you,");
  if (o.fullName) lines.push("{{full_name}}");
  if (o.email) lines.push("{{user_email}}");
  if (o.phoneLast4) lines.push("Phone ending in {{phone_last4}}");
  lines.push("Date: {{date}}");

  const values: Partial<Record<Token, string>> = {
    listing_url: o.listingUrl ? clean(o.listingUrl) : undefined,
    full_name: o.fullName ? clean(o.fullName) : undefined,
    user_email: o.email ? clean(o.email) : undefined,
    phone_last4: o.phoneLast4 ? clean(o.phoneLast4) : undefined,
    date: (o.now ?? new Date()).toISOString().slice(0, 10),
  };
  return { subject: "Request to Remove My Personal Information", body: renderTemplate(lines.join("\n"), values) };
}

export const last4 = (phone: string): string => phone.replace(/\D/g, "").slice(-4);

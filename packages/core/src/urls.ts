import { AppError } from "./errors";

const MAX_URL_LENGTH = 2048;

const invalid = () =>
  new AppError(400, "invalid_listing_url", "That link isn't valid for this source. Use the exact https address of your own listing on the source's website.");

/**
 * Validates a user-supplied listing URL against the source's approved domain.
 * The server never fetches this URL; it is stored (encrypted) and shown back to its owner.
 * Rules: https only, no credentials, no custom port, hostname is the approved domain or a subdomain of it.
 * Errors never echo the submitted value.
 */
export function validateListingUrl(input: string, approvedDomain: string): string {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_URL_LENGTH) throw invalid();
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw invalid();
  }
  if (u.protocol !== "https:") throw invalid();
  if (u.username || u.password || u.port) throw invalid();
  const host = u.hostname.toLowerCase();
  if (host.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === "localhost") throw invalid();
  const domain = approvedDomain.toLowerCase();
  if (host !== domain && !host.endsWith(`.${domain}`)) throw invalid();
  u.hash = "";
  return u.toString();
}

/** Official opt-out URLs set by admins follow the same rules. */
export function validateOfficialUrl(input: string, domain: string): string {
  try {
    return validateListingUrl(input, domain);
  } catch {
    throw new AppError(400, "invalid_official_url", "The official opt-out URL must be https on the source's own domain.");
  }
}

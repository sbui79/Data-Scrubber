import { SAFETY_RESOURCES, SUPPORT_POLICY } from "@privatepath/core";

/** Public on purpose: someone in a difficult situation shouldn't need to sign in to see this. */
export function GET() {
  return Response.json({ ...SAFETY_RESOURCES, supportPolicy: SUPPORT_POLICY });
}

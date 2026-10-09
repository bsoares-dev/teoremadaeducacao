import "server-only";
import { getAuth } from "../auth";
import { getSupabaseAdmin } from "../supabaseAdmin";
import { findOwnedPdfLicense, getOrCreateOwnedPdfLicense } from "./repository";
import { licensePurchaseSchema, PdfLicenseError } from "./types";

async function context(input: unknown) {
  const parsed = licensePurchaseSchema.safeParse(input);
  if (!parsed.success) throw new PdfLicenseError("INVALID_REQUEST");
  const { user } = await getAuth(); // Authoritative getUser(), never frontend userId.
  if (!user) throw new PdfLicenseError("UNAUTHENTICATED");
  if (user.is_anonymous || !user.email_confirmed_at) throw new PdfLicenseError("ACCESS_DENIED");
  return { userId: user.id, purchase: parsed.data, db: getSupabaseAdmin() };
}

export async function findMyPdfLicense(input: unknown) {
  const { db, userId, purchase } = await context(input);
  return findOwnedPdfLicense(db, userId, purchase);
}

// Foundation only: not connected to checkout, library, downloads or admin yet.
// An active license NEVER replaces the existing purchase/access-grant checks.
export async function ensureMyActivePdfLicense(input: unknown) {
  const { db, userId, purchase } = await context(input);
  const license = await getOrCreateOwnedPdfLicense(db, userId, purchase);
  if (license.status === "revoked") throw new PdfLicenseError("LICENSE_REVOKED");
  return license;
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateLicenseCode } from "./code";
import { pdfLicenseSchema, PdfLicenseError, type LicensePurchase, type PdfLicense } from "./types";

const columns = "id,user_id,product_id,order_id,order_item_id,license_code,status,created_at,updated_at,revoked_at";

function parseLicense(data: unknown, userId: string, purchase: LicensePurchase): PdfLicense {
  const result = pdfLicenseSchema.safeParse(data);
  if (!result.success || result.data.user_id !== userId || result.data.order_id !== purchase.orderId || result.data.product_id !== purchase.productId) {
    throw new PdfLicenseError("LICENSE_UNAVAILABLE");
  }
  return result.data;
}

// userId must come from verified server Auth. No unscoped license lookup.
export async function findOwnedPdfLicense(db: SupabaseClient, userId: string, purchase: LicensePurchase): Promise<PdfLicense | null> {
  const { data, error } = await db.from("pdf_licenses").select(columns)
    .eq("user_id", userId).eq("order_id", purchase.orderId).eq("product_id", purchase.productId).maybeSingle();
  if (error) throw new PdfLicenseError("LICENSE_UNAVAILABLE");
  return data === null ? null : parseLicense(data, userId, purchase);
}

export async function getOrCreateOwnedPdfLicense(db: SupabaseClient, userId: string, purchase: LicensePurchase): Promise<PdfLicense> {
  // Purchase races are handled by the RPC/unique constraint. Only an extremely
  // unlikely random-code collision reaches 23505 and needs a fresh candidate.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.rpc("teorema_get_or_create_pdf_license", {
      p_user_id: userId, p_order_id: purchase.orderId, p_product_id: purchase.productId,
      p_license_code: generateLicenseCode(),
    });
    if (!error) return parseLicense(data, userId, purchase);
    if (error.code === "23505") continue;
    if (error.code === "42501") throw new PdfLicenseError("ACCESS_DENIED");
    if (error.code === "22023") throw new PdfLicenseError("INVALID_REQUEST");
    throw new PdfLicenseError("LICENSE_UNAVAILABLE");
  }
  throw new PdfLicenseError("LICENSE_UNAVAILABLE");
}

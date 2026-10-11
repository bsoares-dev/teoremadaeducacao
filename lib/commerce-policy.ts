// Availability only. Session, ownership, payment, admin and PDF checks remain
// authoritative in the existing server services/RPCs; this is not authorization.
export type CommerceEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  TEOREMA_CATALOG_SELECTION_ENABLED?: string;
  TEOREMA_CART_ENABLED?: string;
  TEOREMA_PRODUCT_UPLOADS_ENABLED?: string;
};

export function commercialFeatureEnabled(value: string | undefined, env: CommerceEnvironment): boolean {
  if (value !== undefined && value !== "true" && value !== "false") return false;
  const environment = env.VERCEL_ENV ?? env.NODE_ENV;
  if (!["production", "preview", "development"].includes(environment || "")) return false;
  // Production release explicitly authorized on 11/10/2026. Preserve opt-in in
  // Preview/development and an explicit, fail-closed emergency switch everywhere.
  return value === "true" || (value === undefined && environment === "production");
}

export function productUploadsEnabled(env: CommerceEnvironment): boolean {
  return commercialFeatureEnabled(env.TEOREMA_PRODUCT_UPLOADS_ENABLED, env);
}

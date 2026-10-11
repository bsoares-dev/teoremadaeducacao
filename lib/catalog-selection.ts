import { z } from "zod";
import { commercialFeatureEnabled, type CommerceEnvironment } from "./commerce-policy";

export const SELECTION_KEY = "teorema:pdf-selection:v1";
export const SELECTION_LIMIT = 50;
export const selectionRequest = z.object({ ids: z.array(z.string().uuid()).max(SELECTION_LIMIT + 12) }).strict();
export type MaterialState = "available" | "owned" | "unavailable";
export type Material = { id: string; name: string; description: string | null; price: number; image_url: string | null };

export function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && z.string().uuid().safeParse(id).success).map(id => id.toLowerCase()))].slice(0, SELECTION_LIMIT);
}

export function parseSelection(raw: string | null): string[] {
  if (!raw || raw.length > 5000) return [];
  try {
    const data = JSON.parse(raw);
    return data?.version === 1 ? normalizeIds(data.ids) : [];
  } catch { return []; }
}

export function serializeSelection(ids: string[]) {
  return JSON.stringify({ version: 1, ids: normalizeIds(ids) });
}

// Used by the future cart merge: IDs only; server must recheck prices/access.
export function mergeSelectionIds(persisted: string[], visitor: string[]) {
  return normalizeIds([...persisted, ...visitor]);
}

export function materialStates(ids: string[], available: string[], owned: string[]): Record<string, MaterialState> {
  const published = new Set(available), acquired = new Set(owned);
  return Object.fromEntries(ids.map(id => [id, acquired.has(id) ? "owned" : published.has(id) ? "available" : "unavailable"]));
}

// Historical name retained to keep every existing page/API on the same policy.
// Production is now supported; this function does not grant access to a PDF.
export function selectionPreviewEnabled(env: CommerceEnvironment) {
  return commercialFeatureEnabled(env.TEOREMA_CATALOG_SELECTION_ENABLED, env);
}

export function publicCover(value: string | null, projectUrl: string | undefined): string | null {
  if (!value || !projectUrl) return null;
  try {
    const url = new URL(value), project = new URL(projectUrl);
    return url.protocol === "https:" && url.origin === project.origin && !url.username && !url.password &&
      !url.search && !url.hash && /^\/storage\/v1\/object\/public\/teorema-covers\/products\/[\da-f-]+\/[\da-f-]+\.webp$/.test(url.pathname)
      ? url.href : null;
  } catch { return null; }
}

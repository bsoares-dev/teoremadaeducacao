import { z } from "zod";
import { selectionPreviewEnabled } from "./catalog-selection";

const id = z.string().uuid();
export const cartMutation = z.object({
  operationId: id, cartId: id.nullable(), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  addIds: z.array(id).max(50), removeIds: z.array(id).max(50),
}).strict().refine(value => value.addIds.length + value.removeIds.length > 0 && !value.addIds.some(id => value.removeIds.includes(id)), "Seleção inválida.");
export type CartMutation = z.infer<typeof cartMutation>;
export const cartSnapshot = z.object({
  id: id.nullable(), revision: z.number().int().nonnegative(),
  items: z.array(z.object({ id, name: z.string(), image_url: z.string().nullable(),
    priceCents: z.number().int().nonnegative(), previousPriceCents: z.number().int().nonnegative(),
    priceChanged: z.boolean(), state: z.enum(["available", "owned", "unavailable"]),
  })).max(50),
  totalCents: z.number().int().nonnegative(), hasBlockedItems: z.boolean(),
});
export type CartSnapshot = z.infer<typeof cartSnapshot>;
export const cartResult = z.object({ cart: cartSnapshot, acceptedIds: z.array(id).max(50),
  rejected: z.array(z.object({ id, reason: z.enum(["owned", "unavailable", "limit"]) })).max(50),
});
export type CartResult = z.infer<typeof cartResult>;
export function cartPreviewEnabled(env: Parameters<typeof selectionPreviewEnabled>[0] & { TEOREMA_CART_ENABLED?: string }) {
  return env.TEOREMA_CART_ENABLED === "true" && selectionPreviewEnabled(env);
}
export const cartMoney = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function remainingSelection(current: string[], accepted: string[]) {
  const done = new Set(accepted);
  return current.filter(id => !done.has(id));
}
export function cartPendingKey(userId: string) { return `teorema:cart-pending:v1:${userId}`; }
export function parsePending(raw: string | null): CartMutation | null {
  if (!raw) return null;
  if (raw.length > 10000) throw new Error("Não foi possível recuperar a operação pendente.");
  return cartMutation.parse(JSON.parse(raw));
}

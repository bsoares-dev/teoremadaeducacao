import { z } from "zod";
import { cartMoney, type CartSnapshot } from "./cart-contract";

const uuid = z.string().uuid();
const cents = z.number().int().positive().max(100000000);
export const orderInput = z.object({
  operationId: uuid, cartId: uuid,
  totalCents: z.number().int().positive().max(9999999999),
  items: z.array(z.object({ id: uuid, priceCents: cents }).strict()).min(1).max(50),
}).strict().refine(v => new Set(v.items.map(i => i.id.toLowerCase())).size === v.items.length &&
  v.items.reduce((sum, i) => sum + i.priceCents, 0) === v.totalCents, "Resumo inválido.");
export type OrderInput = z.infer<typeof orderInput>;
export const orderStatus = z.enum(["AGUARDANDO_CONFIRMACAO", "CONFIRMADO", "CANCELADO"]);
export const orderSummary = z.object({ id: uuid, code: z.string().regex(/^TE-\d{12,20}$/), status: orderStatus,
  totalCents: z.number().int().positive().max(9999999999), createdAt: z.string(),
});
export const orderSnapshot = orderSummary.extend({
  items: z.array(z.object({ id: uuid, productId: uuid, name: z.string().min(1).max(255), priceCents: cents })).min(1).max(50),
}).refine(v => v.items.reduce((sum, i) => sum + i.priceCents, 0) === v.totalCents, "Pedido inconsistente.");
export type OrderSnapshot = z.infer<typeof orderSnapshot>;
export const orderStatusLabel = { AGUARDANDO_CONFIRMACAO: "Aguardando confirmação", CONFIRMADO: "Compra confirmada", CANCELADO: "Pedido cancelado" };
export const orderPendingKey = (userId: string) => `teorema:order-pending:v1:${userId}`;
export function parseOrderPending(raw: string | null) {
  if (!raw) return null;
  if (raw.length > 10000) throw new Error("Registro pendente inválido.");
  return orderInput.parse(JSON.parse(raw));
}
export function checkoutInput(cart: CartSnapshot, operationId: string): OrderInput {
  if (cart.hasBlockedItems || cart.items.some(i => i.state !== "available")) throw new Error("Revise os itens indisponíveis.");
  return orderInput.parse({ operationId, cartId: cart.id, totalCents: cart.totalCents,
    items: cart.items.map(i => ({ id: i.id, priceCents: i.priceCents })) });
}
// Strip formatting/control characters from titles so they cannot forge message lines.
function messageTitle(name: string) { return name.replace(/[\p{Cc}\p{Cf}*_~`]/gu, " ").replace(/\s+/g, " ").trim(); }
export function orderWhatsApp(order: OrderSnapshot) {
  const header = `Olá, Teorema da Educação! Gostaria de tratar do pedido ${order.code}.`;
  const ending = `Total: ${cartMoney(order.totalCents)}\nAguardo orientação para pagamento e confirmação. Este pedido não comprova pagamento.`;
  const full = `${header}\n\n${order.items.map((i, n) => `${n + 1}. ${messageTitle(i.name)} — ${cartMoney(i.priceCents)}`).join("\n")}\n\n${ending}`;
  const link = (text: string) => `https://wa.me/5548935011911?text=${encodeURIComponent(text)}`;
  // Conservative application budget, not a claimed WhatsApp platform limit.
  const summarized = link(full).length > 1800;
  const message = summarized ? `${header}\n\nSão ${order.items.length} PDFs. A lista completa e os valores de cada item estão salvos no site; consulte pelo código ${order.code}.\n\n${ending}` : full;
  return { message, fullMessage: full, summarized, url: link(message) };
}

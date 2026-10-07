import { z } from "zod";
import { orderStatus, orderSummary } from "./order-contract";

const uuid = z.string().uuid();
const reason = z.string().trim().min(5, "Informe um motivo com pelo menos 5 caracteres.").max(1000);
export const commerceDecision = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), paymentVerified: z.literal(true) }).strict(),
  z.object({ action: z.literal("cancel"), reason }).strict(),
  z.object({ action: z.literal("access"), grantId: uuid, state: z.enum(["ATIVO", "REVOGADO"]), reason, operationId: uuid }).strict(),
]);
export type CommerceDecision = z.infer<typeof commerceDecision>;
export const pendingDecision = z.object({ orderId: uuid, decision: commerceDecision }).strict();
export type PendingDecision = z.infer<typeof pendingDecision>;
export const commerceJournalKey = (actor: string) => `teorema:admin-decision:v1:${actor}`;
export function parseDecision(raw: string | null) {
  if (!raw) return null;
  if (raw.length > 5000) throw new Error("Tentativa pendente inválida.");
  return pendingDecision.parse(JSON.parse(raw));
}
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Data inválida.");
const emptyOptional = <T extends z.ZodType>(schema: T) => z.preprocess(v => v === "" || v === null ? undefined : v, schema.optional());
const filters = z.object({
  code: emptyOptional(z.string().trim().toUpperCase().regex(/^TE-\d{12,20}$/)),
  email: emptyOptional(z.string().trim().toLowerCase().email().max(255)),
  status: emptyOptional(orderStatus), state: emptyOptional(z.enum(["ATIVO", "REVOGADO"])),
  from: emptyOptional(day), to: emptyOptional(day),
}).refine(v => !v.from || !v.to || v.from <= v.to, "O início deve ser anterior ao fim.");
export function commerceFilters(url: URL) {
  return filters.parse(Object.fromEntries(["code", "email", "status", "state", "from", "to"].map(k => [k, url.searchParams.get(k)])));
}
export function dateBounds(from?: string, to?: string) {
  const following = to ? new Date(Date.parse(to) + 86400000).toISOString().slice(0, 10) : undefined;
  return { start: from && `${from}T00:00:00-03:00`, end: following && `${following}T00:00:00-03:00` };
}
export const commerceOrder = orderSummary.extend({ userId: uuid, email: z.string().nullable() });
export const accessRow = z.object({ id: uuid, orderId: uuid, code: z.string(), userId: uuid, email: z.string().nullable(),
  productId: uuid, name: z.string(), state: z.enum(["ATIVO", "REVOGADO"]), effectiveAccess: z.boolean(),
  grantedAt: z.string(), grantedBy: z.string(), revokedAt: z.string().nullable(), revokedBy: z.string().nullable(), reason: z.string().nullable(),
});
export const auditRow = z.object({ id: uuid, entityId: uuid, actorId: uuid, actorEmail: z.string().nullable(), action: z.string(), reason: z.string().nullable(), createdAt: z.string() });
export const commerceDetail = z.object({
  order: commerceOrder.extend({ confirmedAt: z.string().nullable(), confirmedBy: z.string().nullable(), canceledAt: z.string().nullable(), canceledBy: z.string().nullable(), reason: z.string().nullable() }),
  items: z.array(z.object({ id: uuid, productId: uuid, name: z.string(), priceCents: z.number().int().positive(), access: accessRow.nullable() })).min(1).max(50),
  history: z.array(auditRow), historyTotal: z.number().int().nonnegative(), historyPage: z.number().int().positive(),
});
export type CommerceDetail = z.infer<typeof commerceDetail>;
export type CommerceOrder = z.infer<typeof commerceOrder>;
export type AccessRow = z.infer<typeof accessRow>;
export const decisionLabels = { confirm: "Confirmar compra e liberar materiais", cancel: "Cancelar pedido", ATIVO: "Reliberar acesso", REVOGADO: "Revogar acesso" };
export const auditLabels: Record<string, string> = { ORDER_CONFIRMED: "Compra confirmada e materiais liberados", ORDER_CANCELED: "Pedido cancelado", ACCESS_REVOKED: "Acesso revogado", ACCESS_RESTORED: "Acesso reliberado" };

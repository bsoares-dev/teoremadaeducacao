import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderSnapshot, orderSummary } from "./order-contract";
export const orderColumns = "id,code,status,total_amount,created_at";
export function summarizeOrder(row: { id: string; code: string; status: string; total_amount: number | string; created_at: string }) {
  return orderSummary.parse({ id: row.id, code: row.code, status: row.status,
    totalCents: Math.round(Number(row.total_amount) * 100), createdAt: row.created_at });
}
export async function readOrder(db: SupabaseClient, userId: string, id: string) {
  const order = await db.from("orders").select(orderColumns).eq("id", id).eq("user_id", userId).maybeSingle();
  if (order.error) throw new Error("Order read unavailable");
  if (!order.data) return null;
  const items = await db.from("order_items").select("id,product_id,product_name,unit_price").eq("order_id", id).eq("user_id", userId).order("product_id").limit(50);
  if (items.error) throw new Error("Order items unavailable");
  return orderSnapshot.parse({ ...summarizeOrder(order.data), items: (items.data || []).map(i => ({
    id: i.id, productId: i.product_id, name: i.product_name, priceCents: Math.round(Number(i.unit_price) * 100),
  })) });
}

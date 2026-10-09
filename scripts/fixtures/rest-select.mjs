// Minimal local PostgREST transport: SQL/RLS/column grants remain real in PGlite.
// Both table and field names are allowlisted; all filter values are parameters.
const fields = {
  profiles: "id,full_name,email,cpf,phone,created_at",
  orders: "id,code,user_id,status,total_amount,created_at,confirmed_at,confirmed_by,canceled_at,canceled_by,cancellation_reason",
  order_items: "id,order_id,user_id,product_id,product_name,unit_price,created_at",
  access_grants: "id,order_item_id,user_id,product_id,state,granted_by,granted_at,revoked_by,revoked_at,revocation_reason,created_at",
  admin_audit_events: "id,entity_id,actor_id,action,reason,created_at",
};
export const fixtureTables = Object.keys(fields);
export async function fixtureSelect(tx, url, res, single) {
  const table = url.pathname.split("/").at(-1), allowed = fields[table]?.split(",");
  if (!allowed) throw new Error("Unknown fixture table");
  const column = name => { if (!allowed.includes(name)) throw new Error("Unapproved fixture field: " + name); return `"${name}"`; };
  const selected = (url.searchParams.get("select") || "").split(",").map(column).join(",");
  const params = [], conditions = [];
  for (const [name, filter] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(name)) continue;
    const col = column(name), dot = filter.indexOf("."), op = filter.slice(0, dot), value = filter.slice(dot + 1);
    if (op === "in") {
      if (!value.startsWith("(") || !value.endsWith(")")) throw new Error("Invalid fixture list");
      params.push(value.slice(1, -1).split(",").filter(Boolean).map(v => v.replace(/^"|"$/g, "")));
      conditions.push(`${col}::text = any($${params.length}::text[])`);
    } else {
      const operator = { eq: "=", gte: ">=", lt: "<" }[op];
      if (!operator) throw new Error("Unsupported fixture filter");
      params.push(value); conditions.push(`${col} ${operator} $${params.length}`);
    }
  }
  const where = conditions.length ? " where " + conditions.join(" and ") : "";
  const count = (await tx.query(`select count(*)::int as n from ${table}${where}`, params)).rows[0].n;
  const sort = (url.searchParams.get("order") || "id.asc").split(",").map(value => {
    const [name, direction] = value.split("."); if (!["asc", "desc"].includes(direction)) throw new Error("Invalid fixture sort");
    return column(name) + " " + direction;
  }).join(",");
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0), limit = Math.min(1000, Math.max(0, Number(url.searchParams.get("limit") || 1000)));
  const rows = (await tx.query(`select ${selected} from ${table}${where} order by ${sort} limit ${limit} offset ${offset}`, params)).rows;
  res.setHeader("Content-Range", `${offset}-${Math.max(offset, offset + rows.length - 1)}/${count}`);
  return single ? rows[0] || null : rows;
}

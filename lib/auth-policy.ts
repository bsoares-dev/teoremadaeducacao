export const ADMIN_EMAIL = "bernardozsoares11@gmail.com";

export function isAdmin(user: { email?: string; email_confirmed_at?: string; is_anonymous?: boolean } | null) {
  return Boolean(user?.email_confirmed_at && !user.is_anonymous && user.email?.trim().toLowerCase() === ADMIN_EMAIL);
}

export async function verifiedAdmin(user: { id: string; email?: string; email_confirmed_at?: string; is_anonymous?: boolean } | null,
  check: (id: string) => Promise<{ data: unknown; error: { code?: string } | null }>) {
  if (!isAdmin(user)) return false;
  const result = await check(user!.id);
  if (result.error?.code === "42501") return false;
  if (result.error) throw new Error("Verificação administrativa temporariamente indisponível.");
  return result.data === true;
}

export function safeNext(value: string | null | undefined, fallback = "/perfil") {
  // Only application-owned destinations; never forward arbitrary URLs.
  return value && (["/perfil", "/carrinho", "/admin", "/materiais", "/pedidos", "/meus-materiais"].includes(value) ||
    /^\/pedidos\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) ? value : fallback;
}

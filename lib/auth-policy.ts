export const ADMIN_EMAIL = "bernardozsoares11@gmail.com";

export function isAdmin(user: { email?: string; email_confirmed_at?: string } | null) {
  return Boolean(user?.email_confirmed_at && user.email?.trim().toLowerCase() === ADMIN_EMAIL);
}

export function safeNext(value: string | null | undefined, fallback = "/perfil") {
  // Only application-owned destinations; never forward arbitrary URLs.
  return value && (["/perfil", "/carrinho", "/admin", "/materiais", "/pedidos"].includes(value) ||
    /^\/pedidos\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) ? value : fallback;
}

// Static CSP keeps public pages cacheable. Inline Next/React scripts are allowed;
// this is defense in depth, not a nonce-based/strict XSS policy.
export function securityHeaders(env = process.env) {
  const dev = env.NODE_ENV === "development";
  const connections = new Set(["'self'"]);
  const images = new Set(["'self'", "data:", "blob:"]);
  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(dev && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) {
      throw new Error("Origem Supabase inválida para a política de segurança.");
    }
    connections.add(url.origin); images.add(url.origin);
    if (url.hostname.endsWith(".supabase.co")) {
      connections.add(`https://${url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co")}`);
    }
  }
  // HMR only; never allow arbitrary WebSocket hosts in a production build.
  if (dev) { connections.add("ws://localhost:*"); connections.add("ws://127.0.0.1:*"); }
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src ${[...images].join(" ")}`,
    `connect-src ${[...connections].join(" ")}`,
    "worker-src 'self' blob:", "frame-src 'none'", "object-src 'none'",
    "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}

export function headerRules(env = process.env) {
  const privatePaths = ["/login", "/cadastro", "/perfil/:path*", "/admin/:path*", "/carrinho/:path*", "/pedidos/:path*", "/meus-materiais/:path*", "/auth/:path*", "/api/:path*"];
  return [
    { source: "/:path*", headers: securityHeaders(env) },
    ...privatePaths.map(source => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] })),
    ...(env.VERCEL_ENV === "preview" || env.NODE_ENV === "development"
      ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }] : []),
  ];
}

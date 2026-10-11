// Explicit operational command. No credentials, passwords or email defaults are committed.
// UUID grants are applied separately through the authorized private database connection.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const targets = process.argv.slice(2).map(value => {
  const [email, id, extra] = value.trim().toLowerCase().split("=");
  return { email, id, extra };
});
if (!targets.length || targets.some(({ email, id, extra }) => extra !== undefined || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id || "")) ||
    new Set(targets.map(target => target.email)).size !== targets.length || new Set(targets.map(target => target.id)).size !== targets.length) {
  throw new Error("Informe EMAIL_AUTORIZADO=UUID_V4 previamente reservado no banco, sem duplicatas.");
}
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (base !== "https://urgzsaftoiebsjkgyhsg.supabase.co" || !key || !publicKey) throw new Error("Projeto ou credenciais administrativas não conferem.");
const redirectTo = "https://www.teoremadaeducacao.com.br/auth/ativar";
const page = await fetch(redirectTo, { signal: AbortSignal.timeout(20000) });
if (!page.ok || !(await page.text()).includes("activate-title")) throw new Error("Publique e verifique a tela de primeiro acesso antes de convidar.");
const settings = await fetch(base + "/auth/v1/settings", { headers: { apikey: publicKey }, signal: AbortSignal.timeout(15000) });
if (!settings.ok || (await settings.json()).mailer_autoconfirm !== false) throw new Error("Mantenha Confirm email ligado enquanto convites administrativos estiverem pendentes.");
const client = createClient(base, key, { auth: { autoRefreshToken: false, persistSession: false } });
for (const { email, id } of targets) {
  const existing = await client.auth.admin.getUserById(id);
  if (existing.error && existing.error.code !== "user_not_found") throw new Error("Não foi possível conferir o UUID reservado. Nenhum convite será reenviado automaticamente.");
  let prepared = existing.data.user;
  if (!prepared) {
    const result = await client.auth.admin.createUser({
      id, email, email_confirm: false, role: "authenticated",
      app_metadata: { teorema_profile_origin: "controlled_admin_invitation" },
    });
    if (result.error) {
      console.log(JSON.stringify({ email, prepared: false, status: result.error.status, code: result.error.code }));
      process.exitCode = 1;
      break;
    }
    prepared = result.data.user;
  }
  if (!prepared || prepared.id !== id || prepared.email?.toLowerCase() !== email || prepared.email_confirmed_at || prepared.invited_at || prepared.is_anonymous || prepared.app_metadata?.teorema_profile_origin !== "controlled_admin_invitation") {
    throw new Error("Conta inesperada ou convite já emitido. Confira o estado antes de continuar.");
  }
  const { data, error } = await client.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) {
    console.log(JSON.stringify({ email, sent: false, status: error.status, code: error.code }));
    process.exitCode = 1;
    break; // Do not retry a mail send or assume that a partial operation can be rolled back.
  }
  const user = data.user;
  if (user?.id !== id || user.email?.toLowerCase() !== email || !user.invited_at || user.email_confirmed_at || user.is_anonymous) {
    throw new Error("Convite retornou um estado inesperado. Confira a conta antes de atribuir privilégios.");
  }
  console.log(JSON.stringify({ email, id: user.id, sent: true, invitedAt: user.invited_at, confirmed: false }));
}

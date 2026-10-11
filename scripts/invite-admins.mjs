// Explicit operational command. No credentials, passwords or email defaults are committed.
// UUID grants are applied separately through the authorized private database connection.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const emails = process.argv.slice(2).map(email => email.trim().toLowerCase());
if (!emails.length || emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || new Set(emails).size !== emails.length) {
  throw new Error("Informe apenas os e-mails explicitamente autorizados, sem duplicatas.");
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
for (const email of emails) {
  const { data, error } = await client.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) {
    console.log(JSON.stringify({ email, sent: false, status: error.status, code: error.code }));
    process.exitCode = 1;
    break; // Do not retry a mail send or assume that a partial operation can be rolled back.
  }
  const user = data.user;
  if (!user?.id || user.email?.toLowerCase() !== email || !user.invited_at || user.email_confirmed_at || user.is_anonymous) {
    throw new Error("Convite retornou um estado inesperado. Confira a conta antes de atribuir privilégios.");
  }
  console.log(JSON.stringify({ email, id: user.id, sent: true, invitedAt: user.invited_at, confirmed: false }));
}

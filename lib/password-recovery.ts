import { z } from "zod";
import { safeNext } from "./auth-policy";
import { passwordSetupError } from "./invite-session";
import { SITE_URL } from "./seo";

export const RECOVERY_SENT = "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Confira também o spam.";
export const INVALID_RECOVERY = "O link de recuperação é inválido ou expirou. Solicite um novo link para continuar.";
export const RECOVERY_UNAVAILABLE = "Não foi possível enviar o link agora. Aguarde um pouco e tente novamente.";
export const RECOVERY_WAIT = "Aguarde 60 segundos antes de solicitar outro link.";
export const RECOVERY_PASSWORD_ERROR = "Não foi possível salvar a nova senha. Use uma senha forte e tente novamente.";
export const recoveryEmailSchema = z.string().trim().max(254).pipe(z.email());

type RecoveryUser = { id: string; email_confirmed_at?: string; is_anonymous?: boolean };
type RecoveryIdentity = {
  getUser: () => Promise<{ data: { user: RecoveryUser | null }; error: unknown }>;
};
type RecoverySessionAuth = RecoveryIdentity & {
  setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<{ error: unknown }>;
  verifyOtp: (params: { token_hash: string; type: "recovery" }) => Promise<{ error: unknown }>;
};
type RecoveryPasswordAuth = RecoveryIdentity & {
  updateUser: (attributes: { password: string }) => Promise<{ error: unknown }>;
  signOut: (options: { scope: "global" }) => Promise<{ error: unknown }>;
};
type RecoveryRequestAuth = {
  resetPasswordForEmail: (email: string, options: { redirectTo: string }) => Promise<{ error: unknown }>;
};

// Recovery credentials can only return to the application's canonical origin.
// A supplied `next` is an allowlisted post-login destination, never a host.
export function recoveryDestination(next?: string | null) {
  const url = new URL("/auth/redefinir", SITE_URL);
  if (next) url.searchParams.set("next", safeNext(next));
  return url.href;
}

export function recoveryLoginHref(next?: string | null, updated = false) {
  const query = new URLSearchParams();
  if (next) query.set("next", safeNext(next));
  if (updated) query.set("password", "updated");
  return "/login" + (query.size ? "?" + query.toString() : "");
}

function errorAttribute(error: unknown, key: "code" | "status"): unknown {
  return error && typeof error === "object" && key in error ? (error as Record<string, unknown>)[key] : undefined;
}

export async function requestPasswordRecovery(email: string, next: string | null, auth: RecoveryRequestAuth) {
  const parsed = recoveryEmailSchema.safeParse(email);
  if (!parsed.success) throw new Error("Informe um e-mail válido.");
  let error: unknown;
  try {
    ({ error } = await auth.resetPasswordForEmail(parsed.data, { redirectTo: recoveryDestination(next) }));
  } catch { throw new Error(RECOVERY_UNAVAILABLE); }
  // An unknown address must receive the same message, not an account lookup.
  if (!error || errorAttribute(error, "code") === "user_not_found") return RECOVERY_SENT;
  if (errorAttribute(error, "status") === 429 || ["over_email_send_rate_limit", "over_request_rate_limit"].includes(String(errorAttribute(error, "code")))) {
    throw new Error(RECOVERY_WAIT);
  }
  throw new Error(RECOVERY_UNAVAILABLE);
}

export async function initializePasswordRecovery(hash: string, search: string, auth: RecoverySessionAuth) {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const query = new URLSearchParams(search);
  const source = hash ? fragment : query;
  if (hash.length > 20000 || search.length > 20000 || source.has("error") || source.has("error_code") || source.getAll("type").length !== 1 || source.get("type") !== "recovery") {
    throw new Error(INVALID_RECOVERY);
  }
  try {
    if (hash) {
      const access_token = fragment.get("access_token"), refresh_token = fragment.get("refresh_token");
      if (!access_token || !refresh_token || fragment.getAll("access_token").length !== 1 || fragment.getAll("refresh_token").length !== 1) throw new Error(INVALID_RECOVERY);
      const { error } = await auth.setSession({ access_token, refresh_token });
      if (error) throw new Error(INVALID_RECOVERY);
    } else {
      // Supports an optional custom Supabase template with TokenHash + type=recovery.
      const token_hash = query.get("token_hash");
      if (!token_hash || query.getAll("token_hash").length !== 1) throw new Error(INVALID_RECOVERY);
      const { error } = await auth.verifyOtp({ token_hash, type: "recovery" });
      if (error) throw new Error(INVALID_RECOVERY);
    }
    // Auth verifies the token server-side. Never trust claims, localStorage,
    // user_metadata or a supplied userId as proof of account ownership.
    const { data, error } = await auth.getUser();
    if (error || !data.user?.id || !data.user.email_confirmed_at || data.user.is_anonymous) throw new Error(INVALID_RECOVERY);
    return data.user.id;
  } catch { throw new Error(INVALID_RECOVERY); }
}

export async function saveRecoveredPassword(expectedId: string, password: string, confirmation: string, auth: RecoveryPasswordAuth) {
  const validation = passwordSetupError(password, confirmation);
  if (validation) throw new Error(validation);
  const { data, error: identityError } = await auth.getUser().catch(() => { throw new Error(INVALID_RECOVERY); });
  if (identityError || !expectedId || data.user?.id !== expectedId || !data.user.email_confirmed_at || data.user.is_anonymous) throw new Error(INVALID_RECOVERY);
  // Only the isolated recovery account changes its own password. No privileged
  // client, chosen userId or mutation of profile/admin roles participates here.
  const { error } = await auth.updateUser({ password }).catch(() => { throw new Error(RECOVERY_PASSWORD_ERROR); });
  if (error) throw new Error(RECOVERY_PASSWORD_ERROR);
  // A logout failure must not be reported as a failed password change.
  try {
    const result = await auth.signOut({ scope: "global" });
    return { signedOut: !result.error };
  } catch { return { signedOut: false }; }
}

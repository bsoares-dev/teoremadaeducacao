type InviteUser = { id: string; email_confirmed_at?: string; is_anonymous?: boolean };
type InviteAuth = {
  setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<{ error: unknown }>;
  getUser: () => Promise<{ data: { user: InviteUser | null }; error: unknown }>;
};

export const INVALID_INVITE = "O convite é inválido ou expirou. Peça à equipe um novo link.";

export async function initializeInvite(hash: string, auth: InviteAuth) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (hash) {
    const access_token = params.get("access_token"), refresh_token = params.get("refresh_token");
    if (params.has("error") || params.get("type") !== "invite" || !access_token || !refresh_token) {
      throw new Error(INVALID_INVITE);
    }
    const { error } = await auth.setSession({ access_token, refresh_token });
    if (error) throw new Error(INVALID_INVITE);
  }
  // Never trust JWT fields, a userId parameter or local storage as proof of identity.
  const { data, error } = await auth.getUser();
  if (error || !data.user?.id || !data.user.email_confirmed_at || data.user.is_anonymous) {
    throw new Error(INVALID_INVITE);
  }
  return data.user.id;
}

export function passwordSetupError(password: string, confirmation: string) {
  if (password.length < 8 || password.length > 128) return "Use uma senha com 8 a 128 caracteres.";
  return password !== confirmation ? "As senhas precisam ser iguais." : null;
}

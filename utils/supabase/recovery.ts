import { createClient } from "@supabase/supabase-js";

export function createPasswordRecoveryClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Serviço de recuperação indisponível.");
  // Only publishable credentials. Recovery is held in this client's memory,
  // not the SSR cookie store or localStorage of an already logged-in account.
  // Supabase's default email supplies a single-use recovery session; the page
  // verifies it explicitly and clears the URL before any authenticated calls.
  return createClient(url, key, {
    auth: {
      flowType: "implicit", persistSession: false, autoRefreshToken: false,
      detectSessionInUrl: false, storageKey: "teorema-password-recovery",
    },
  });
}

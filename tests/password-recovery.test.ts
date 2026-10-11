import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INVALID_RECOVERY, RECOVERY_PASSWORD_ERROR, RECOVERY_SENT, RECOVERY_UNAVAILABLE, RECOVERY_WAIT,
  initializePasswordRecovery, recoveryDestination, recoveryLoginHref, requestPasswordRecovery, saveRecoveredPassword,
} from "../lib/password-recovery";
import { createPasswordRecoveryClient } from "../utils/supabase/recovery";

const user = { id: "recovery-fixture", email_confirmed_at: "2026-10-11", is_anonymous: false };
const forbidden = async () => { throw new Error("Auth must not be called"); };
const fragment = "#type=recovery&access_token=fixture-access&refresh_token=fixture-refresh";

test("password recovery keeps credentials on the canonical origin and allowlists the post-login destination", () => {
  assert.equal(recoveryDestination(), "https://www.teoremadaeducacao.com.br/auth/redefinir");
  assert.equal(recoveryLoginHref(), "/login");
  assert.equal(recoveryLoginHref(null, true), "/login?password=updated");
  assert.equal(recoveryLoginHref("/carrinho", true), "/login?next=%2Fcarrinho&password=updated");
  for (const next of ["https://evil.example", "//evil.example", "/auth/redefinir?userId=other", "/perfil?token=private"]) {
    const url = new URL(recoveryDestination(next));
    assert.equal(url.origin, "https://www.teoremadaeducacao.com.br");
    assert.equal(url.pathname, "/auth/redefinir");
    assert.equal(url.searchParams.get("next"), "/perfil");
    assert.equal(recoveryLoginHref(next), "/login?next=%2Fperfil");
  }
});

test("recovery requests validate the email and cannot create accounts or expose enumeration results", async () => {
  let requested = "";
  assert.equal(await requestPasswordRecovery("  fixture@example.test  ", "/carrinho", {
    resetPasswordForEmail: async (email, options) => {
      requested = email;
      assert.equal(options.redirectTo, "https://www.teoremadaeducacao.com.br/auth/redefinir?next=%2Fcarrinho");
      return { error: null };
    },
  }), RECOVERY_SENT);
  assert.equal(requested, "fixture@example.test");
  assert.equal(await requestPasswordRecovery("unknown@example.test", null, {
    resetPasswordForEmail: async () => ({ error: { code: "user_not_found", message: "Private account details" } }),
  }), RECOVERY_SENT);
  for (const email of ["", "not-an-email", "a".repeat(255) + "@example.test"]) {
    await assert.rejects(() => requestPasswordRecovery(email, null, { resetPasswordForEmail: forbidden }), { message: "Informe um e-mail válido." });
  }
});

test("recovery requests sanitize SMTP, transport and throttling errors", async () => {
  for (const error of [{ status: 429 }, { code: "over_email_send_rate_limit" }, { code: "over_request_rate_limit" }]) {
    await assert.rejects(() => requestPasswordRecovery("fixture@example.test", null, {
      resetPasswordForEmail: async () => ({ error }),
    }), { message: RECOVERY_WAIT });
  }
  for (const error of [{ status: 500, message: "SMTP password private" }, new Error("secret stack")]) {
    await assert.rejects(() => requestPasswordRecovery("fixture@example.test", null, {
      resetPasswordForEmail: async () => ({ error }),
    }), { message: RECOVERY_UNAVAILABLE });
  }
  await assert.rejects(() => requestPasswordRecovery("fixture@example.test", null, { resetPasswordForEmail: forbidden }), { message: RECOVERY_UNAVAILABLE });
});

test("complete recovery fragments are explicitly verified with Auth before accepting the identity", async () => {
  const calls: string[] = [];
  assert.equal(await initializePasswordRecovery(fragment, "?userId=other", {
    setSession: async tokens => { calls.push("session"); assert.deepEqual(tokens, { access_token: "fixture-access", refresh_token: "fixture-refresh" }); return { error: null }; },
    verifyOtp: forbidden,
    getUser: async () => { calls.push("user"); return { data: { user }, error: null }; },
  }), user.id);
  assert.deepEqual(calls, ["session", "user"]);
});

test("custom recovery TokenHash links verify only the recovery OTP type", async () => {
  assert.equal(await initializePasswordRecovery("", "?token_hash=fixture-otp&type=recovery&next=%2Fcarrinho", {
    setSession: forbidden,
    verifyOtp: async params => { assert.deepEqual(params, { token_hash: "fixture-otp", type: "recovery" }); return { error: null }; },
    getUser: async () => ({ data: { user }, error: null }),
  }), user.id);
});

test("ordinary sessions, wrong-purpose, malformed and ambiguous links cannot start recovery", async () => {
  const auth = { setSession: forbidden, verifyOtp: forbidden, getUser: forbidden };
  const invalid = [
    ["", ""], ["", "?next=%2Fperfil"], ["", "?code=fixture-pkce"],
    ["#type=invite&access_token=a&refresh_token=b", ""], ["#type=signup&access_token=a&refresh_token=b", ""],
    ["#type=recovery&access_token=a", ""], ["#type=recovery&refresh_token=b", ""],
    ["#type=recovery&type=invite&access_token=a&refresh_token=b", ""],
    ["#type=recovery&access_token=a&access_token=b&refresh_token=c", ""],
    ["#type=recovery&access_token=a&refresh_token=b&error_code=otp_expired", ""],
    ["", "?token_hash=a&type=email"], ["", "?token_hash=a&token_hash=b&type=recovery"],
    ["#" + "x".repeat(20001), ""],
  ];
  for (const [hash, search] of invalid) await assert.rejects(() => initializePasswordRecovery(hash, search, auth), { message: INVALID_RECOVERY });
});

test("expired, reused, rejected and unconfirmed recovery accounts are denied without leaking details", async () => {
  await assert.rejects(() => initializePasswordRecovery(fragment, "", {
    setSession: async () => ({ error: new Error("private token") }), verifyOtp: forbidden, getUser: forbidden,
  }), { message: INVALID_RECOVERY });
  await assert.rejects(() => initializePasswordRecovery("", "?type=recovery&token_hash=used", {
    setSession: forbidden, verifyOtp: async () => ({ error: { code: "otp_expired" } }), getUser: forbidden,
  }), { message: INVALID_RECOVERY });
  for (const candidate of [null, { id: "" }, { id: "unconfirmed" }, { ...user, is_anonymous: true }]) {
    await assert.rejects(() => initializePasswordRecovery(fragment, "", {
      setSession: async () => ({ error: null }), verifyOtp: forbidden, getUser: async () => ({ data: { user: candidate }, error: null }),
    }), { message: INVALID_RECOVERY });
  }
  await assert.rejects(() => initializePasswordRecovery(fragment, "", {
    setSession: async () => ({ error: null }), verifyOtp: forbidden, getUser: forbidden,
  }), { message: INVALID_RECOVERY });
});

test("saving recovery rechecks the exact account and updates only its password before global logout", async () => {
  const calls: string[] = [];
  assert.deepEqual(await saveRecoveredPassword(user.id, "fixture-new-password", "fixture-new-password", {
    getUser: async () => { calls.push("user"); return { data: { user }, error: null }; },
    updateUser: async attributes => { calls.push("password"); assert.deepEqual(attributes, { password: "fixture-new-password" }); return { error: null }; },
    signOut: async options => { calls.push("logout"); assert.deepEqual(options, { scope: "global" }); return { error: null }; },
  }), { signedOut: true });
  assert.deepEqual(calls, ["user", "password", "logout"]);
});

test("invalid passwords and account changes cannot modify credentials", async () => {
  for (const [password, confirmation] of [["short", "short"], ["x".repeat(129), "x".repeat(129)], ["fixture-password", "fixture-password "]]) {
    await assert.rejects(() => saveRecoveredPassword(user.id, password, confirmation, { getUser: forbidden, updateUser: forbidden, signOut: forbidden }));
  }
  for (const candidate of [null, { ...user, id: "other-account" }, { id: user.id }, { ...user, is_anonymous: true }]) {
    await assert.rejects(() => saveRecoveredPassword(user.id, "fixture-password", "fixture-password", {
      getUser: async () => ({ data: { user: candidate }, error: null }), updateUser: forbidden, signOut: forbidden,
    }), { message: INVALID_RECOVERY });
  }
  await assert.rejects(() => saveRecoveredPassword("", "fixture-password", "fixture-password", {
    getUser: async () => ({ data: { user }, error: null }), updateUser: forbidden, signOut: forbidden,
  }), { message: INVALID_RECOVERY });
});

test("failed password writes do not log out or expose errors and logout failures do not undo saved passwords", async () => {
  const getUser = async () => ({ data: { user }, error: null });
  await assert.rejects(() => saveRecoveredPassword(user.id, "fixture-password", "fixture-password", {
    getUser, updateUser: async () => ({ error: new Error("private storage secret") }), signOut: forbidden,
  }), { message: RECOVERY_PASSWORD_ERROR });
  await assert.rejects(() => saveRecoveredPassword(user.id, "fixture-password", "fixture-password", {
    getUser, updateUser: forbidden, signOut: forbidden,
  }), { message: RECOVERY_PASSWORD_ERROR });
  for (const signOut of [async () => ({ error: new Error("network") }), forbidden]) {
    assert.deepEqual(await saveRecoveredPassword(user.id, "fixture-password", "fixture-password", {
      getUser, updateUser: async () => ({ error: null }), signOut,
    }), { signedOut: false });
  }
});

test("actual Supabase client uses the publishable API, isolated memory, and the recovery/user/logout HTTP contract", async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://recovery-fixture.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_fixture";
  const access = [Buffer.from('{"alg":"HS256"}').toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"), Buffer.from("fixture-signature").toString("base64url")].join(".");
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, "https://recovery-fixture.supabase.co", "Never access production in this test");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("apikey"), "sb_publishable_test_fixture");
    const method = init?.method ?? "GET";
    calls.push(method + " " + url.pathname);
    if (url.pathname === "/auth/v1/recover") {
      assert.equal(url.searchParams.get("redirect_to"), recoveryDestination("/carrinho"));
      const body = JSON.parse(String(init?.body)) as { email: string; code_challenge?: unknown };
      assert.equal(body.email, "fixture@example.test");
      assert.equal(body.code_challenge, null, "No browser-bound PKCE verifier is required by the recovery email");
      return Response.json({});
    }
    assert.equal(headers.get("authorization"), "Bearer " + access);
    if (url.pathname === "/auth/v1/user") {
      if (method === "PUT") assert.deepEqual(JSON.parse(String(init?.body)), { password: "fixture-new-password", code_challenge: null, code_challenge_method: null });
      return Response.json({ ...user, aud: "authenticated", created_at: "2026-10-11", email: "fixture@example.test", app_metadata: {}, user_metadata: {} });
    }
    if (url.pathname === "/auth/v1/logout") { assert.equal(url.searchParams.get("scope"), "global"); return new Response(null, { status: 204 }); }
    throw new Error("Unexpected API route");
  };
  try {
    const client = createPasswordRecoveryClient();
    assert.equal(await requestPasswordRecovery("fixture@example.test", "/carrinho", client.auth), RECOVERY_SENT);
    const expectedId = await initializePasswordRecovery("#type=recovery&access_token=" + access + "&refresh_token=fixture-refresh", "", client.auth);
    assert.equal(expectedId, user.id);
    assert.deepEqual(await saveRecoveredPassword(expectedId, "fixture-new-password", "fixture-new-password", client.auth), { signedOut: true });
    assert.ok(calls.includes("POST /auth/v1/recover"));
    assert.ok(calls.includes("PUT /auth/v1/user"));
    assert.ok(calls.includes("POST /auth/v1/logout"));
    assert.equal((await client.auth.getSession()).data.session, null);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});

test("recovery screens preserve the existing design and remove URL tokens before client initialization", () => {
  const login = readFileSync("app/login/page.tsx", "utf8");
  assert.match(login, /auth-recovery-link[^>]*href=\{recoveryHref\}/);
  assert.ok(login.indexOf("Esqueci minha senha") < login.indexOf('className="auth-submit"'));
  const reset = readFileSync("app/auth/redefinir/reset-password.tsx", "utf8");
  assert.ok(reset.indexOf("window.history.replaceState") < reset.indexOf("client.current = createPasswordRecoveryClient()"));
  assert.match(reset, /Solicitar novo link/);
  const factory = readFileSync("utils/supabase/recovery.ts", "utf8");
  assert.match(factory, /persistSession: false/);
  assert.match(factory, /detectSessionInUrl: false/);
  assert.ok(!factory.includes("SUPABASE_SERVICE_ROLE_KEY"));
  for (const path of ["app/auth/recuperar/page.tsx", "app/auth/redefinir/page.tsx"]) assert.match(readFileSync(path, "utf8"), /index: false, follow: false/);
});

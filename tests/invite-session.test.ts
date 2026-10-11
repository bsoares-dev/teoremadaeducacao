import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeInvite, INVALID_INVITE, passwordSetupError } from "../lib/invite-session";

const user = { id: "invited-uuid", email_confirmed_at: "2026-10-11" };

test("invitation accepts only a complete invite session and verifies identity with Auth", async () => {
  const calls: string[] = [];
  const auth = {
    setSession: async (tokens: { access_token: string; refresh_token: string }) => {
      assert.deepEqual(tokens, { access_token: "fixture-access", refresh_token: "fixture-refresh" });
      calls.push("session"); return { error: null };
    },
    getUser: async () => { calls.push("user"); return { data: { user }, error: null }; },
  };
  assert.equal(await initializeInvite("#type=invite&access_token=fixture-access&refresh_token=fixture-refresh", auth), user.id);
  assert.deepEqual(calls, ["session", "user"]);
  calls.length = 0;
  assert.equal(await initializeInvite("", auth), user.id);
  assert.deepEqual(calls, ["user"], "Refreshing the page checks an existing session without trusting cached identity");
});

test("malformed, expired and unrelated tokens cannot establish an invitation session", async () => {
  const forbidden = async () => { throw new Error("Must not call Auth"); };
  for (const hash of ["#error=access_denied", "#type=invite&access_token=a", "#type=recovery&access_token=a&refresh_token=b", "#userId=admin", "#type=signup&access_token=a&refresh_token=b"]) {
    await assert.rejects(() => initializeInvite(hash, { setSession: forbidden, getUser: forbidden }), { message: INVALID_INVITE });
  }
  await assert.rejects(() => initializeInvite("#type=invite&access_token=a&refresh_token=b", {
    setSession: async () => ({ error: new Error("Internal secret must not escape") }), getUser: forbidden,
  }), { message: INVALID_INVITE });
});

test("missing, unconfirmed, anonymous and rejected users cannot set up an invite", async () => {
  for (const candidate of [null, { id: "" }, { id: "other" }, { ...user, is_anonymous: true }]) {
    await assert.rejects(() => initializeInvite("", {
      setSession: async () => ({ error: null }), getUser: async () => ({ data: { user: candidate }, error: null }),
    }), { message: INVALID_INVITE });
  }
  await assert.rejects(() => initializeInvite("", {
    setSession: async () => ({ error: null }), getUser: async () => ({ data: { user }, error: new Error("Offline") }),
  }), { message: INVALID_INVITE });
});

test("password setup requires matching bounded passwords without silently trimming them", () => {
  assert.equal(passwordSetupError("fixture-strong", "fixture-strong"), null);
  assert.equal(passwordSetupError("long enough", "long enough "), "As senhas precisam ser iguais.");
  for (const password of ["short", "x".repeat(129)]) assert.equal(passwordSetupError(password, password), "Use uma senha com 8 a 128 caracteres.");
});

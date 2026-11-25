/**
 * SILVER SPOON — Phase 6.4 Authentication Adapter & Session Management Tests
 *
 * Verifies:
 * A. Authentication Contract (async Promise methods, provider resolution, validation, onboarding deps)
 * B. Mock Authentication (registration, login, email verification, password recovery, suspension, clean init)
 * C. Session Management (init, refresh, expiration, restore expiry rejection, logout cleanup, event sync)
 * D. Security (zero plaintext password persistence, zero token exposure/logging, DB-authoritative RBAC,
 *    no browser-controlled privilege escalation, route separation, zero auto Supabase client construction)
 * E. Supabase Standby Adapter (zero network calls, AUTH_STANDBY_DISCONNECTED, activation disabled, pure mappers)
 *
 * Run: node --test scripts/tests/phase6-4-auth-foundation.test.mjs
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SRC_DIR = path.join(ROOT, "src");

function resolveLocalFile(base) {
  const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), base];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = resolveLocalFile(path.join(SRC_DIR, specifier.slice(2)));
      if (resolved) return { url: resolved, shortCircuit: true };
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file://")
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const resolved = resolveLocalFile(path.resolve(parentDir, specifier));
      if (resolved) return { url: resolved, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.(jpg|jpeg|png|webp|svg)(\?.*)?$/i.test(url)) {
      return {
        format: "module",
        source: `export default ${JSON.stringify(url)};`,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const authIndex = await import("../../src/services/auth/index.ts");
const supabaseAuth = await import("../../src/services/supabase/auth/index.ts");
const supabaseConfig = await import("../../src/services/supabase/config.ts");
const mockProviderMod = await import("../../src/services/mockDataProvider.ts");
const mockIntegrity = await import("../../src/utils/mockIntegrity.ts");

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _dump: () => Object.fromEntries(map.entries()),
  };
}

function walkFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

// ── A. Authentication Contract ────────────────────────────────────────────────

describe("Phase 6.4 A — Authentication Contract & Provider Resolution", () => {
  it("exposes all 11 AuthContract methods on both mock and supabase adapters", () => {
    const requiredMethods = [
      "register",
      "login",
      "logout",
      "getSession",
      "getCurrentUser",
      "refreshSession",
      "verifyEmail",
      "resendVerificationEmail",
      "requestPasswordReset",
      "resetPassword",
      "onAuthStateChange",
    ];
    for (const adapter of [authIndex.authAdapters.mock, authIndex.authAdapters.supabase]) {
      for (const method of requiredMethods) {
        assert.equal(typeof adapter[method], "function", `Missing ${method} on ${adapter.providerId}`);
      }
    }
  });

  it("defaults resolveAuthAdapter() to mock, selects disconnected supabase when requested, and throws on invalid provider", () => {
    const defaultAdapter = authIndex.resolveAuthAdapter({});
    assert.equal(defaultAdapter.providerId, "mock");
    assert.equal(defaultAdapter.standbyMode, false);
    assert.equal(defaultAdapter.roleAuthority, "mock_local");

    const explicitMock = authIndex.resolveAuthAdapter({ VITE_DATA_PROVIDER: "mock" });
    assert.equal(explicitMock.providerId, "mock");

    const standbySupabase = authIndex.resolveAuthAdapter({ VITE_DATA_PROVIDER: "supabase" });
    assert.equal(standbySupabase.providerId, "supabase");
    assert.equal(standbySupabase.standbyMode, true);
    assert.equal(standbySupabase.roleAuthority, "database_authoritative");

    assert.throws(
      () => authIndex.resolveAuthAdapter({ VITE_DATA_PROVIDER: "firebase" }),
      (err) => err instanceof authIndex.InvalidAuthProviderError && err.requestedProvider === "firebase",
    );
  });

  it("validates email & password inputs safely and declares backend-owned onboarding dependencies", () => {
    assert.equal(authIndex.validateAuthEmailInput("client@example.com").valid, true);
    assert.equal(authIndex.validateAuthEmailInput("not-an-email").valid, false);
    assert.equal(authIndex.validateAuthPasswordInput("StrongPass123!").valid, true);
    assert.equal(authIndex.validateAuthPasswordInput("short").valid, false);
    assert.equal(authIndex.validateAuthPasswordInput("x".repeat(200)).valid, false);

    assert.equal(authIndex.BACKEND_ONBOARDING_DEPENDENCIES.length, 7);
    for (const dep of authIndex.BACKEND_ONBOARDING_DEPENDENCIES) {
      assert.equal(dep.frontendPermittedToWrite, false);
    }
  });
});

// ── B. Mock Authentication ────────────────────────────────────────────────────

describe("Phase 6.4 B — Mock Authentication Flows", () => {
  it("starts with a clean empty state (no preloaded users or active session)", async () => {
    const storage = createMemoryStorage();
    const provider = mockProviderMod.createMockDataProvider({ storage });
    const adapter = authIndex.createMockAuthAdapter({ dataProvider: provider });

    assert.equal(provider.getState().users.length, 0);
    const sessionRes = await adapter.getSession();
    const userRes = await adapter.getCurrentUser();
    assert.equal(sessionRes.ok, true);
    assert.equal(sessionRes.data, null);
    assert.equal(userRes.ok, true);
    assert.equal(userRes.data, null);
  });

  it("supports registration, email verification, logout, login, and password recovery end-to-end", async () => {
    const storage = createMemoryStorage();
    const provider = mockProviderMod.createMockDataProvider({ storage });
    const adapter = authIndex.createMockAuthAdapter({ dataProvider: provider });

    // 1. Register
    const reg = await adapter.register({
      fullName: "Adaeze Nwosu",
      email: "adaeze@example.com",
      password: "InitialPassword#2026",
      phone: "+2348011112222",
    });
    assert.equal(reg.ok, true);
    assert.equal(reg.data.user.portalRole, "investor");
    assert.deepEqual(reg.data.user.dbRoles, ["investor"]);
    assert.equal(reg.data.user.emailVerified, false);
    assert.equal(reg.data.emailVerificationRequired, true);
    assert.equal(reg.data.user.onboarding.stage, "awaiting_email_verification");

    // 2. Resend & verify email
    const codeRes = await adapter.resendVerificationEmail();
    assert.equal(codeRes.ok, true);
    assert.equal(codeRes.data.sent, true);
    assert.match(codeRes.data.simulatedCode, /^\d{6}$/);

    const badVerify = await adapter.verifyEmail({
      email: "adaeze@example.com",
      tokenOrCode: "000000",
    });
    assert.equal(badVerify.ok, false);
    assert.equal(badVerify.error.code, "AUTH_INVALID_VERIFICATION_CODE");

    const verified = await adapter.verifyEmail({
      email: "adaeze@example.com",
      tokenOrCode: codeRes.data.simulatedCode,
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.data.emailVerified, true);
    assert.equal(verified.data.onboarding.stage, "ready");

    // 3. Logout & login validation
    const out = await adapter.logout();
    assert.equal(out.ok, true);

    const badLogin = await adapter.login({
      email: "adaeze@example.com",
      password: "WrongPassword#2026",
    });
    assert.equal(badLogin.ok, false);
    assert.equal(badLogin.error.code, "AUTH_INVALID_CREDENTIALS");

    const goodLogin = await adapter.login({
      email: "adaeze@example.com",
      password: "InitialPassword#2026",
    });
    assert.equal(goodLogin.ok, true);
    assert.equal(goodLogin.data.user.email, "adaeze@example.com");
    assert.equal(goodLogin.data.session.authenticated, true);

    // 4. Password recovery & reset
    await adapter.logout();
    const reqReset = await adapter.requestPasswordReset({ email: "adaeze@example.com" });
    assert.equal(reqReset.ok, true);
    assert.equal(reqReset.data.dispatched, true);
    assert.ok(reqReset.data.simulatedResetToken.length >= 6);

    const resetOk = await adapter.resetPassword({
      email: "adaeze@example.com",
      token: reqReset.data.simulatedResetToken,
      newPassword: "RotatedPassword#2026",
    });
    assert.equal(resetOk.ok, true);

    const oldPwLogin = await adapter.login({
      email: "adaeze@example.com",
      password: "InitialPassword#2026",
    });
    assert.equal(oldPwLogin.ok, false);

    const newPwLogin = await adapter.login({
      email: "adaeze@example.com",
      password: "RotatedPassword#2026",
    });
    assert.equal(newPwLogin.ok, true);
  });

  it("blocks suspended accounts from logging in", async () => {
    const storage = createMemoryStorage();
    const provider = mockProviderMod.createMockDataProvider({ storage });
    const adapter = authIndex.createMockAuthAdapter({ dataProvider: provider });

    const reg = await adapter.register({
      fullName: "Suspended Client",
      email: "suspended@example.com",
      password: "ValidPassword#2026",
      phone: "+2348022223333",
    });
    assert.equal(reg.ok, true);
    await adapter.logout();

    // Mark user suspended in snapshot
    const snap = provider.getState();
    snap.users = snap.users.map((u) =>
      u.id === reg.data.user.id ? { ...u, status: "Suspended" } : u,
    );
    provider.saveSnapshot(snap, storage);
    await provider.hydrateState();

    const attempt = await adapter.login({
      email: "suspended@example.com",
      password: "ValidPassword#2026",
    });
    assert.equal(attempt.ok, false);
    assert.equal(attempt.error.code, "AUTH_ACCOUNT_SUSPENDED");
  });
});

// ── C. Session Management ─────────────────────────────────────────────────────

describe("Phase 6.4 C — Session Lifecycle, Expiration & Event Synchronization", () => {
  it("supports session refresh, automatic expiration cleanup, explicit expireSession, and onAuthStateChange sync", async () => {
    let clockMs = Date.parse("2026-11-25T10:00:00.000Z");
    const storage = createMemoryStorage();
    const provider = mockProviderMod.createMockDataProvider({ storage });
    const adapter = authIndex.createMockAuthAdapter({
      dataProvider: provider,
      sessionTtlMs: 60_000,
      now: () => clockMs,
    });

    const events = [];
    const unsubscribe = adapter.onAuthStateChange((evt) => {
      events.push(evt.event);
    });

    await adapter.register({
      fullName: "Tunde Bakare",
      email: "tunde@example.com",
      password: "SessionPass#2026",
      phone: "+2348033334444",
    });

    const s1 = await adapter.getSession();
    assert.equal(s1.ok, true);
    assert.equal(s1.data.authenticated, true);
    const initialExpiry = s1.data.expiresAt;

    // Advance 30s and refresh session
    clockMs += 30_000;
    const refreshed = await adapter.refreshSession();
    assert.equal(refreshed.ok, true);
    assert.ok(Date.parse(refreshed.data.expiresAt) > Date.parse(initialExpiry));

    // Advance past refreshed TTL (65s) -> session expires and clears cleanly
    clockMs += 65_000;
    const expiredSession = await adapter.getSession();
    assert.equal(expiredSession.ok, false);
    assert.equal(expiredSession.data, null);
    assert.equal(expiredSession.error.code, "AUTH_SESSION_EXPIRED");
    assert.equal(provider.getState().session.authenticated, false);

    // Re-login, test explicit expireSession and logout cleanup
    await adapter.login({ email: "tunde@example.com", password: "SessionPass#2026" });
    await adapter.expireSession();
    assert.equal(provider.getState().session.authenticated, false);

    await adapter.login({ email: "tunde@example.com", password: "SessionPass#2026" });
    await adapter.logout();
    assert.equal(provider.getState().session.authenticated, false);

    unsubscribe();
    await adapter.login({ email: "tunde@example.com", password: "SessionPass#2026" });

    assert.deepEqual(events, [
      "SIGNED_IN",
      "TOKEN_REFRESHED",
      "SESSION_EXPIRED",
      "SIGNED_IN",
      "SESSION_EXPIRED",
      "SIGNED_IN",
      "SIGNED_OUT",
    ]);
  });

  it("rejects expired sessions during storage restoration via sanitizeRestoredSession", () => {
    const nowMs = Date.parse("2026-11-25T12:00:00.000Z");
    const mockUser = {
      id: "USR-1",
      fullName: "Test User",
      email: "test@example.com",
      phone: "+2348000000000",
      city: "Lagos",
      address: "VI",
      role: "investor",
      tier: "Silver",
      status: "Active",
      kycLevel: "Tier 2",
      referralCode: "SS-TEST12",
      joinedAt: "2026-11-20T00:00:00.000Z",
      lastLoginAt: "2026-11-25T09:00:00.000Z",
      twoFactorEnabled: false,
      emailAlerts: true,
      smsAlerts: false,
      bankAccount: {
        bankName: "GTBank",
        bankCode: "058",
        accountNumber: "",
        accountName: "TEST USER",
        verified: false,
      },
    };

    const expired = mockIntegrity.sanitizeRestoredSession(
      {
        authenticated: true,
        userId: "USR-1",
        role: "investor",
        issuedAt: "2026-11-25T08:00:00.000Z",
        expiresAt: "2026-11-25T11:59:59.000Z",
      },
      [mockUser],
      nowMs,
    );
    assert.equal(expired.authenticated, false);
    assert.equal(expired.userId, "");

    const valid = mockIntegrity.sanitizeRestoredSession(
      {
        authenticated: true,
        userId: "USR-1",
        role: "admin", // forged role in storage must be normalized to user's actual role
        issuedAt: "2026-11-25T10:00:00.000Z",
        expiresAt: "2026-11-25T18:00:00.000Z",
      },
      [mockUser],
      nowMs,
    );
    assert.equal(valid.authenticated, true);
    assert.equal(valid.role, "investor");
    assert.equal(valid.expiresAt, "2026-11-25T18:00:00.000Z");
  });
});

// ── D. Security Controls ──────────────────────────────────────────────────────

describe("Phase 6.4 D — Security Invariants", () => {
  it("never persists plaintext passwords to localStorage or exposes passwords on client user objects", async () => {
    const storage = createMemoryStorage();
    const provider = mockProviderMod.createMockDataProvider({ storage });
    const adapter = authIndex.createMockAuthAdapter({ dataProvider: provider });

    const secretPassword = "UltraSecretPassword!9876";
    const rotatedPassword = "RotatedUltraSecret!5432";

    const reg = await adapter.register({
      fullName: "Security Check",
      email: "sec@example.com",
      password: secretPassword,
      phone: "+2348044445555",
    });
    assert.equal(reg.ok, true);
    assert.equal("password" in reg.data.user, false);
    assert.equal(reg.data.profile.password, undefined);

    // Check serialized storage contains ZERO plaintext password
    const rawStoredAfterReg = storage.getItem(provider.storageKey) ?? "";
    assert.equal(rawStoredAfterReg.includes(secretPassword), false);
    assert.equal(rawStoredAfterReg.includes('"password"'), false);

    // Change password and verify storage STILL contains ZERO plaintext password
    const chg = await provider.changePassword(secretPassword, rotatedPassword);
    assert.equal(chg.ok, true);
    const rawStoredAfterChg = storage.getItem(provider.storageKey) ?? "";
    assert.equal(rawStoredAfterChg.includes(secretPassword), false);
    assert.equal(rawStoredAfterChg.includes(rotatedPassword), false);
    assert.equal(rawStoredAfterChg.includes('"password"'), false);

    // Hydrated state users also have zero password property
    const hydrated = await provider.hydrateState();
    for (const user of hydrated.users) {
      assert.equal(user.password, undefined);
      assert.equal("password" in user, false);
    }
  });

  it("never exposes tokens in AuthSession/AuthUser, redacts sensitive payloads, and avoids token logging", async () => {
    const storage = createMemoryStorage();
    const provider = mockProviderMod.createMockDataProvider({ storage });
    const adapter = authIndex.createMockAuthAdapter({ dataProvider: provider });

    const reg = await adapter.register({
      fullName: "Token Guard",
      email: "tokens@example.com",
      password: "TokenGuardPass#2026",
      phone: "+2348055556666",
    });
    const forbiddenKeys = [
      "password",
      "accessToken",
      "access_token",
      "refreshToken",
      "refresh_token",
      "providerToken",
      "provider_token",
    ];
    for (const key of forbiddenKeys) {
      assert.equal(key in reg.data.session, false, `Unexpected ${key} in AuthSession`);
      assert.equal(key in reg.data.user, false, `Unexpected ${key} in AuthUser`);
    }

    const redacted = authIndex.redactAuthPayloadForLogging({
      email: "tokens@example.com",
      password: "MyPassword123!",
      nested: {
        access_token: "eyJhbGciOiJIUzI1NiJ9.payload.sig",
        refresh_token: "refresh-secret-xyz",
      },
    });
    assert.equal(redacted.email, "tokens@example.com");
    assert.equal(redacted.password, "[REDACTED]");
    assert.equal(redacted.nested.access_token, "[REDACTED]");
    assert.equal(redacted.nested.refresh_token, "[REDACTED]");

    // Static check: no console.log calls inside src/services/auth or src/services/supabase/auth
    const authFiles = [
      ...walkFiles(path.join(SRC_DIR, "services/auth")),
      ...walkFiles(path.join(SRC_DIR, "services/supabase/auth")),
    ];
    for (const file of authFiles) {
      const content = readFileSync(file, "utf8");
      assert.equal(
        /\bconsole\.(log|debug|info|warn|error)\s*\(/.test(content),
        false,
        `Unexpected console logging in ${path.relative(ROOT, file)}`,
      );
    }
  });

  it("prevents browser-controlled privilege escalation and enforces DB-authoritative RBAC", () => {
    const rawUserWithTamperedMetadata = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "attacker@example.com",
      email_confirmed_at: "2026-11-25T10:00:00.000Z",
      user_metadata: {
        full_name: "Normal Client",
        role: "super_admin",
        is_admin: true,
        roles: ["admin", "super_admin"],
      },
      app_metadata: {
        role: "admin",
      },
    };

    // Without DB roles, user MUST fail closed to portalRole "investor" and dbRoles []
    const mappedNoDb = supabaseAuth.mapSupabaseUserToAuthUser(rawUserWithTamperedMetadata);
    assert.equal(mappedNoDb.portalRole, "investor");
    assert.deepEqual(mappedNoDb.dbRoles, []);
    assert.equal(mappedNoDb.roleAuthority, "database_authoritative");

    // With explicit DB investor role, tampered metadata still yields investor
    const mappedInvestor = supabaseAuth.mapSupabaseUserToAuthUser(rawUserWithTamperedMetadata, {
      dbRoles: ["investor"],
    });
    assert.equal(mappedInvestor.portalRole, "investor");
    assert.deepEqual(mappedInvestor.dbRoles, ["investor"]);

    // Only authoritative DB admin/super_admin/staff rows grant admin portalRole
    const mappedAdmin = supabaseAuth.mapSupabaseUserToAuthUser(rawUserWithTamperedMetadata, {
      dbRoles: ["admin"],
    });
    assert.equal(mappedAdmin.portalRole, "admin");
    assert.deepEqual(mappedAdmin.dbRoles, ["admin"]);
  });

  it("preserves investor/admin route separation, zero @supabase/supabase-js install, and zero automatic client construction", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.dependencies?.["@supabase/supabase-js"], undefined);
    assert.equal(pkg.devDependencies?.["@supabase/supabase-js"], undefined);

    const routeGuardsSrc = readFileSync(
      path.join(SRC_DIR, "components/auth/RouteGuards.tsx"),
      "utf8",
    );
    assert.match(routeGuardsSrc, /export function ProtectedRoute/);
    assert.match(routeGuardsSrc, /export function InvestorRoute/);
    assert.match(routeGuardsSrc, /export function AdminRoute/);
    assert.match(routeGuardsSrc, /authState\.sessionExpired/);

    const providerSrc = readFileSync(
      path.join(SRC_DIR, "context/AppStateProvider.tsx"),
      "utf8",
    );
    assert.equal(providerSrc.includes("@/services/supabase"), false);
    assert.equal(providerSrc.includes("mockDataProvider"), false);

    // Ensure clientFactory is NEVER called when constructing standby adapter
    let clientFactoryCalled = false;
    const standby = supabaseAuth.createSupabaseAuthAdapter({
      clientFactory: () => {
        clientFactoryCalled = true;
        throw new Error("Should never be invoked while standby is locked");
      },
    });
    assert.equal(clientFactoryCalled, false);
    assert.equal(standby.activationAllowed, false);
    assert.equal(supabaseConfig.SUPABASE_LIVE_ACTIVATION_ALLOWED, false);
  });
});

// ── E. Supabase Standby Adapter ───────────────────────────────────────────────

describe("Phase 6.4 E — Disconnected Supabase Standby Adapter & Mappers", () => {
  it("makes zero network requests and returns AUTH_STANDBY_DISCONNECTED across all methods", async () => {
    let fetchCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCount += 1;
      throw new Error("Network call forbidden in Phase 6.4 standby mode");
    };

    try {
      const adapter = supabaseAuth.createSupabaseAuthAdapter({
        env: {
          VITE_DATA_PROVIDER: "supabase",
          VITE_SUPABASE_URL: "https://example-staging.supabase.co",
          VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.stub",
        },
      });

      assert.equal(adapter.standbyMode, true);
      assert.equal(adapter.activationAllowed, false);

      const results = await Promise.all([
        adapter.register({
          fullName: "Standby User",
          email: "standby@example.com",
          password: "StandbyPassword#1",
          phone: "+2348099990000",
        }),
        adapter.login({ email: "standby@example.com", password: "StandbyPassword#1" }),
        adapter.logout(),
        adapter.getSession(),
        adapter.getCurrentUser(),
        adapter.refreshSession(),
        adapter.verifyEmail({ email: "standby@example.com", tokenOrCode: "123456" }),
        adapter.resendVerificationEmail(),
        adapter.requestPasswordReset({ email: "standby@example.com" }),
        adapter.resetPassword({
          email: "standby@example.com",
          token: "token",
          newPassword: "NewStandbyPassword#1",
        }),
      ]);

      const unsub = adapter.onAuthStateChange(() => {});
      assert.equal(typeof unsub, "function");
      unsub();

      for (const res of results) {
        assert.equal(res.ok, false);
        assert.equal(res.error?.code, "AUTH_STANDBY_DISCONNECTED");
        assert.equal(res.error?.provider, "supabase");
      }
      assert.equal(fetchCount, 0, "Expected zero network fetch calls in standby mode");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("strips raw JWT tokens from mapped Supabase sessions and models multi-step backend onboarding accurately", () => {
    const rawSession = {
      access_token: "eyJhbGciOiJIUzI1NiJ9.access.secret",
      refresh_token: "refresh-token-secret",
      provider_token: "provider-secret",
      provider_refresh_token: "provider-refresh-secret",
      expires_in: 3600,
      expires_at: Math.floor(Date.parse("2026-11-25T15:00:00.000Z") / 1000),
      token_type: "bearer",
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        email: "investor@example.com",
        email_confirmed_at: "2026-11-25T10:00:00.000Z",
        last_sign_in_at: "2026-11-25T14:00:00.000Z",
      },
    };

    const nowMs = Date.parse("2026-11-25T14:30:00.000Z");
    const mappedSession = supabaseAuth.mapSupabaseSessionToAuthSession(
      rawSession,
      { dbRoles: ["investor"] },
      nowMs,
    );
    assert.equal(mappedSession.authenticated, true);
    assert.equal(mappedSession.expired, false);
    assert.equal(mappedSession.portalRole, "investor");
    assert.equal("access_token" in mappedSession, false);
    assert.equal("refresh_token" in mappedSession, false);
    assert.equal("provider_token" in mappedSession, false);
    assert.equal(JSON.stringify(mappedSession).includes("access.secret"), false);
    assert.equal(JSON.stringify(mappedSession).includes("refresh-token-secret"), false);

    // Expired Supabase session
    const expiredSession = supabaseAuth.mapSupabaseSessionToAuthSession(
      rawSession,
      { dbRoles: ["investor"] },
      Date.parse("2026-11-25T16:00:00.000Z"),
    );
    assert.equal(expiredSession.authenticated, false);
    assert.equal(expiredSession.expired, true);

    // Onboarding state when auth user exists & verified email, but backend trigger hasn't provisioned rows yet
    const onboardingIncomplete = supabaseAuth.deriveSupabaseOnboardingState(rawSession.user);
    assert.equal(onboardingIncomplete.stage, "awaiting_backend_provisioning");
    assert.equal(onboardingIncomplete.requiresServerProvisioning, true);
    assert.deepEqual(onboardingIncomplete.missingBackendArtifacts, [
      "public.profiles",
      "public.user_roles",
      "public.wallets",
    ]);

    // Onboarding state when account is frozen in DB
    const onboardingFrozen = supabaseAuth.deriveSupabaseOnboardingState(rawSession.user, {
      profile: {
        id: rawSession.user.id,
        client_code: "SS-00001",
        full_name: "Frozen Client",
        email: "investor@example.com",
        phone: null,
        city: null,
        address: null,
        tier: "Silver",
        status_code: "frozen",
        investor_classification: "retail_individual",
        kyc_tier: "Tier 1",
        referral_code: "SS-FRZN11",
        email_verified_at: "2026-11-25T10:00:00.000Z",
        closed_at: null,
        created_at: "2026-11-25T10:00:00.000Z",
        updated_at: "2026-11-25T10:00:00.000Z",
      },
      dbRoles: ["investor"],
      wallet: {
        id: "w-1",
        user_id: rawSession.user.id,
        currency: "NGN",
        status: "frozen",
        available_account_id: "acct-avail",
        reserved_account_id: "acct-res",
        invested_account_id: "acct-inv",
        frozen_reason: "Compliance hold",
        frozen_by: null,
        frozen_at: "2026-11-25T11:00:00.000Z",
        created_at: "2026-11-25T10:00:00.000Z",
        updated_at: "2026-11-25T11:00:00.000Z",
      },
    });
    assert.equal(onboardingFrozen.stage, "account_restricted");
    assert.equal(onboardingFrozen.accountStatusChecked, "blocked");

    // Auth event, recovery state, and error mapping
    assert.equal(supabaseAuth.mapSupabaseAuthEvent("PASSWORD_RECOVERY"), "PASSWORD_RECOVERY");
    assert.equal(
      supabaseAuth.mapSupabasePasswordRecoveryState("PASSWORD_RECOVERY").inRecoveryMode,
      true,
    );
    assert.equal(
      supabaseAuth.mapSupabaseAuthError({ message: "Invalid login credentials" }).code,
      "AUTH_INVALID_CREDENTIALS",
    );
    assert.equal(
      supabaseAuth.mapSupabaseAuthError({ message: "Email not confirmed", code: "email_not_confirmed" })
        .code,
      "AUTH_EMAIL_NOT_VERIFIED",
    );
  });
});

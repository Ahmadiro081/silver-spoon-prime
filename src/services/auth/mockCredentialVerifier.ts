/**
 * SILVER SPOON — Local Mock Credential Verifier (Phase 6.5 Part A)
 *
 * Strictly scoped to the browser-local mock test environment (`mockDataProvider`).
 * Uses the runtime's native W3C Web Crypto API (`crypto.subtle` PBKDF2-HMAC-SHA256)
 * with a per-credential 128-bit CSPRNG salt and constant-time comparison so that:
 * - ZERO plaintext passwords are EVER persisted in localStorage or sessionStorage.
 * - ZERO plaintext passwords are retained in runtime memory or UserProfile objects.
 * - Mock accounts survive browser refresh and logout/re-login cleanly.
 *
 * Production / Supabase authentication NEVER uses this module; Supabase Auth owns
 * all production password hashing, verification, recovery, and session issuance.
 */

export const MOCK_VERIFIER_STORAGE_KEY = "silver-spoon-mock-verifiers-v1";
export const MOCK_PBKDF2_ITERATIONS = 100_000;
const SALT_BYTE_LENGTH = 16;
const DERIVED_KEY_BITS = 256;

export interface MockPasswordVerifierRecord {
  readonly alg: "PBKDF2-SHA256";
  readonly iterations: number;
  readonly salt: string;
  readonly derivedKey: string;
}

export interface VerifierStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(encoded, "base64"));
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

function getWebCrypto(): Crypto {
  if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
    throw new Error(
      "Web Crypto API (crypto.subtle) is unavailable in this environment; unable to derive mock credential verifier safely.",
    );
  }
  return globalThis.crypto;
}

async function derivePbkdf2Bits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const webCrypto = getWebCrypto();
  const encoder = new TextEncoder();
  const keyMaterial = await webCrypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer;
  const bits = await webCrypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    DERIVED_KEY_BITS,
  );
  return new Uint8Array(bits);
}

/**
 * Derives a non-reversible, per-user salted PBKDF2-HMAC-SHA256 verifier record
 * using native Web Crypto API (`crypto.subtle`).
 */
export async function createMockPasswordVerifier(
  password: string,
): Promise<MockPasswordVerifierRecord> {
  const webCrypto = getWebCrypto();
  const salt = new Uint8Array(SALT_BYTE_LENGTH);
  webCrypto.getRandomValues(salt);
  const derived = await derivePbkdf2Bits(password, salt, MOCK_PBKDF2_ITERATIONS);
  return {
    alg: "PBKDF2-SHA256",
    iterations: MOCK_PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    derivedKey: bytesToBase64(derived),
  };
}

/**
 * Verifies a candidate password against a stored PBKDF2-HMAC-SHA256 verifier record
 * using constant-time byte comparison.
 */
export async function verifyMockPassword(
  candidatePassword: string,
  record: MockPasswordVerifierRecord | null | undefined,
): Promise<boolean> {
  if (
    !record ||
    record.alg !== "PBKDF2-SHA256" ||
    typeof record.iterations !== "number" ||
    record.iterations < 10_000 ||
    typeof record.salt !== "string" ||
    typeof record.derivedKey !== "string" ||
    !record.salt ||
    !record.derivedKey
  ) {
    return false;
  }
  try {
    const salt = base64ToBytes(record.salt);
    const expected = base64ToBytes(record.derivedKey);
    const actual = await derivePbkdf2Bits(candidatePassword, salt, record.iterations);
    return timingSafeEqualBytes(actual, expected);
  } catch {
    return false;
  }
}

function isValidVerifierRecord(value: unknown): value is MockPasswordVerifierRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.alg === "PBKDF2-SHA256" &&
    typeof candidate.iterations === "number" &&
    candidate.iterations >= 10_000 &&
    typeof candidate.salt === "string" &&
    candidate.salt.length > 0 &&
    typeof candidate.derivedKey === "string" &&
    candidate.derivedKey.length > 0
  );
}

export function loadMockVerifierMap(
  storage: VerifierStorageLike | null,
): Record<string, MockPasswordVerifierRecord> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(MOCK_VERIFIER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean: Record<string, MockPasswordVerifierRecord> = {};
    for (const [userId, record] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidVerifierRecord(record)) {
        clean[userId] = record;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveMockVerifier(
  storage: VerifierStorageLike | null,
  userId: string,
  record: MockPasswordVerifierRecord,
): void {
  if (!storage || !userId) return;
  try {
    const current = loadMockVerifierMap(storage);
    current[userId] = record;
    storage.setItem(MOCK_VERIFIER_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Ignore storage quota errors in sandboxed test environments
  }
}

export function clearMockVerifiers(storage: VerifierStorageLike | null): void {
  if (!storage) return;
  try {
    storage.removeItem(MOCK_VERIFIER_STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

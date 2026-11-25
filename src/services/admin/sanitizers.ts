import type { DbAppRole } from "@/services/supabase/enums";
import type { StaffRole, UserProfile } from "@/types/domain";

/**
 * SILVER SPOON — Phase 6.6 Administrative Data Masking & Role Sanitization Helpers
 *
 * Defense-in-depth protections:
 * - Resolves authoritative roles exclusively from validated account records
 *   (never from localStorage session claims or caller-supplied arguments).
 * - Strips forbidden sensitive keys recursively so raw BVN/NIN, document hashes,
 *   passwords, tokens, and vendor secrets never reach administrative UI projections.
 */

const VALID_STAFF_ROLES: ReadonlySet<StaffRole> = new Set<StaffRole>([
  "super_admin",
  "admin",
  "finance_officer",
  "compliance_officer",
]);

export const FORBIDDEN_ADMIN_PROJECTION_KEYS: ReadonlySet<string> = new Set([
  "password",
  "passwordhash",
  "bvn",
  "nin",
  "idnumber",
  "bvn_hash",
  "bvnhash",
  "nin_hash",
  "ninhash",
  "sha256_checksum",
  "sha256checksum",
  "documenthash",
  "document_hash",
  "vendor_reference",
  "vendorreference",
  "vendor_secret",
  "vendorsecret",
  "apikey",
  "api_key",
  "secret",
  "secretkey",
  "secret_key",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "jwt",
  "token",
  "resettoken",
  "reviewernote",
  "reviewer_note",
  "internalcompliancenote",
  "internal_compliance_note",
  "kycnote",
  "ipaddress",
  "ip_address",
]);

/**
 * Resolves the authoritative 5-role classification from a verified `UserProfile`.
 *
 * Security invariants:
 * - If `user.role !== "admin"`, ALWAYS returns `"investor"`, completely ignoring
 *   any forged or tampered `staffRole` attribute on an investor account.
 * - If `user.role === "admin"` and `user.staffRole` is omitted or unrecognized,
 *   defaults conservatively to `"admin"` (never `"super_admin"`).
 */
export function resolveAuthoritativeRoleFromUser(user: UserProfile | null | undefined): DbAppRole {
  if (!user || user.role !== "admin") {
    return "investor";
  }
  if (user.staffRole && VALID_STAFF_ROLES.has(user.staffRole)) {
    return user.staffRole;
  }
  return "admin";
}

/**
 * Masks any identifier string down to its final 4 digits (`••••XXXX`).
 * Even if a full 11-digit BVN or NIN is passed, ONLY the last 4 digits survive.
 */
export function maskLast4Identifier(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const digits = value.replace(/\D/g, "").slice(-4);
  return digits.length > 0 ? `••••${digits}` : null;
}

/**
 * Strips any accidental 10–11 digit Nigerian BVN/NIN sequences or bearer/token
 * strings from free-text audit summaries before administrative projection.
 */
export function sanitizeActivitySummaryText(summary: string): string {
  return summary
    .replace(/\b\d{11}\b/g, "•••••••XXXX")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]");
}

/**
 * Recursively strips forbidden sensitive keys from any administrative projection object.
 */
export function stripForbiddenSensitiveKeys<T>(input: T): T {
  if (input === null || input === undefined || typeof input !== "object") {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => stripForbiddenSensitiveKeys(item)) as unknown as T;
  }
  const source = input as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (FORBIDDEN_ADMIN_PROJECTION_KEYS.has(key.toLowerCase())) {
      continue;
    }
    clean[key] =
      value !== null && typeof value === "object"
        ? stripForbiddenSensitiveKeys(value)
        : value;
  }
  return clean as T;
}

/**
 * Formats a human-readable label for a staff role for sidebar presentation.
 */
export function formatStaffRoleLabel(role: StaffRole | null): string {
  switch (role) {
    case "super_admin":
      return "Super Admin · Governance";
    case "finance_officer":
      return "Finance Officer · Treasury";
    case "compliance_officer":
      return "Compliance Officer · KYC";
    case "admin":
    default:
      return "Administrator · Ops";
  }
}

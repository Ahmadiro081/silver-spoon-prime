/**
 * SILVER SPOON — Shared Database-to-Frontend Mapping Validators (Phase 6.3)
 *
 * Strict runtime structural guards for converting untrusted database rows into
 * typed frontend models without `any`, silent data loss, or fabricated defaults.
 */

export class DbMappingError extends Error {
  readonly domain: string;
  readonly field: string;

  constructor(domain: string, field: string, message: string) {
    super(`[${domain}.${field}] ${message}`);
    this.name = "DbMappingError";
    this.domain = domain;
    this.field = field;
  }
}

export function assertPlainRecord(
  value: unknown,
  domain: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DbMappingError(domain, "row", "Expected a non-null database record object.");
  }
  return value as Record<string, unknown>;
}

export function assertNonEmptyString(
  row: Record<string, unknown>,
  field: string,
  domain: string,
): string {
  const val = row[field];
  if (typeof val !== "string" || val.trim().length === 0) {
    throw new DbMappingError(domain, field, `Expected a non-empty string for "${field}".`);
  }
  return val;
}

export function assertString(
  row: Record<string, unknown>,
  field: string,
  domain: string,
): string {
  const val = row[field];
  if (typeof val !== "string") {
    throw new DbMappingError(domain, field, `Expected a string for "${field}".`);
  }
  return val;
}

export function readNullableString(
  row: Record<string, unknown>,
  field: string,
  domain: string,
): string | null {
  const val = row[field];
  if (val === null || val === undefined) return null;
  if (typeof val !== "string") {
    throw new DbMappingError(domain, field, `Expected a string or null for "${field}".`);
  }
  return val;
}

export function assertBoolean(
  row: Record<string, unknown>,
  field: string,
  domain: string,
): boolean {
  const val = row[field];
  if (typeof val !== "boolean") {
    throw new DbMappingError(domain, field, `Expected a boolean for "${field}".`);
  }
  return val;
}

export function assertPositiveInteger(
  row: Record<string, unknown>,
  field: string,
  domain: string,
): number {
  const val = row[field];
  if (typeof val !== "number" || !Number.isFinite(val) || !Number.isInteger(val) || val <= 0) {
    throw new DbMappingError(domain, field, `Expected a positive integer for "${field}".`);
  }
  return val;
}

export function assertNonNegativeInteger(
  row: Record<string, unknown>,
  field: string,
  domain: string,
): number {
  const val = row[field];
  if (typeof val !== "number" || !Number.isFinite(val) || !Number.isInteger(val) || val < 0) {
    throw new DbMappingError(domain, field, `Expected a non-negative integer for "${field}".`);
  }
  return val;
}

export function assertIsoTimestamp(
  row: Record<string, unknown>,
  field: string,
  domain: string,
): string {
  const val = assertNonEmptyString(row, field, domain);
  if (Number.isNaN(Date.parse(val))) {
    throw new DbMappingError(domain, field, `Expected a valid ISO timestamp for "${field}" (received "${val}").`);
  }
  return val;
}

export function readNullableIsoTimestamp(
  row: Record<string, unknown>,
  field: string,
  domain: string,
): string | null {
  const val = readNullableString(row, field, domain);
  if (val === null) return null;
  if (Number.isNaN(Date.parse(val))) {
    throw new DbMappingError(domain, field, `Expected a valid ISO timestamp or null for "${field}" (received "${val}").`);
  }
  return val;
}

export function readOptionalJsonObject(
  row: Record<string, unknown>,
  field: string,
  domain: string,
): Record<string, unknown> {
  const val = row[field];
  if (val === null || val === undefined) return {};
  if (typeof val !== "object" || Array.isArray(val)) {
    throw new DbMappingError(domain, field, `Expected a JSON object or null for "${field}".`);
  }
  return val as Record<string, unknown>;
}

export function collectWarnings(
  ...warnings: ReadonlyArray<string | null | undefined>
): readonly string[] {
  return warnings.filter((w): w is string => typeof w === "string" && w.length > 0);
}

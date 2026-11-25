/**
 * SILVER SPOON — Financial Unit Normalization (Integer Kobo <-> Naira) (Phase 6.3)
 *
 * AUTHORITATIVE RULE:
 * - PostgreSQL stores ALL monetary balances and transaction amounts in integer kobo (`BIGINT`).
 *   1 NGN = 100 kobo.
 * - Frontend display models render Naira values.
 * - Conversions MUST use exact integer/string arithmetic and NEVER treat kobo as Naira
 *   or Naira as kobo.
 * - Fractional kobo values, non-finite inputs, and unsafe integers MUST be rejected explicitly.
 * - This module does NOT alter existing mock financial calculations.
 */

export const KOBO_PER_NAIRA = 100;
export const MAX_SAFE_KOBO = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991 kobo (~₦90.07 trillion)
export const MIN_SAFE_KOBO = Number.MIN_SAFE_INTEGER;

const MAX_SAFE_KOBO_BIGINT = BigInt(MAX_SAFE_KOBO);
const MIN_SAFE_KOBO_BIGINT = BigInt(MIN_SAFE_KOBO);
const INTEGER_STRING_PATTERN = /^[+-]?\d+$/;
const NAIRA_DECIMAL_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?$/;

export type KoboInput = number | bigint | string;
export type NairaInput = number | string;

export type FinancialUnitErrorCode =
  | "INVALID_TYPE"
  | "NON_FINITE"
  | "FRACTIONAL_KOBO"
  | "UNSAFE_INTEGER"
  | "NEGATIVE_DISALLOWED"
  | "INVALID_NAIRA_FORMAT"
  | "SUB_KOBO_PRECISION"
  | "INVALID_BASIS_POINTS";

export interface FinancialValidationOptions {
  allowNegative?: boolean;
  fieldName?: string;
}

export class FinancialUnitError extends Error {
  readonly code: FinancialUnitErrorCode;
  readonly fieldName: string;

  constructor(code: FinancialUnitErrorCode, message: string, fieldName = "amount") {
    super(message);
    this.name = "FinancialUnitError";
    this.code = code;
    this.fieldName = fieldName;
  }
}

function parseKoboToBigInt(value: unknown, options: FinancialValidationOptions = {}): bigint {
  const { allowNegative = false, fieldName = "amount_kobo" } = options;

  let parsed: bigint;

  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new FinancialUnitError(
        "NON_FINITE",
        `${fieldName} must be a finite integer kobo value.`,
        fieldName,
      );
    }
    if (!Number.isInteger(value)) {
      throw new FinancialUnitError(
        "FRACTIONAL_KOBO",
        `${fieldName} must be an exact integer kobo value; fractional kobo (${value}) is prohibited.`,
        fieldName,
      );
    }
    if (!Number.isSafeInteger(value)) {
      throw new FinancialUnitError(
        "UNSAFE_INTEGER",
        `${fieldName} exceeds JavaScript safe integer bounds (${value}). Pass a BigInt or canonical integer string.`,
        fieldName,
      );
    }
    parsed = BigInt(value);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new FinancialUnitError(
        "INVALID_TYPE",
        `${fieldName} cannot be an empty string.`,
        fieldName,
      );
    }
    if (!INTEGER_STRING_PATTERN.test(trimmed)) {
      if (/^[+-]?\d+\.\d+$/.test(trimmed)) {
        throw new FinancialUnitError(
          "FRACTIONAL_KOBO",
          `${fieldName} must be an exact integer kobo string; fractional kobo ("${trimmed}") is prohibited.`,
          fieldName,
        );
      }
      throw new FinancialUnitError(
        "INVALID_TYPE",
        `${fieldName} must be a canonical integer kobo string (received "${trimmed}").`,
        fieldName,
      );
    }
    parsed = BigInt(trimmed);
  } else {
    throw new FinancialUnitError(
      "INVALID_TYPE",
      `${fieldName} must be an integer kobo number, bigint, or canonical integer string.`,
      fieldName,
    );
  }

  if (!allowNegative && parsed < 0n) {
    throw new FinancialUnitError(
      "NEGATIVE_DISALLOWED",
      `${fieldName} cannot be negative (received ${parsed.toString()} kobo).`,
      fieldName,
    );
  }

  return parsed;
}

/**
 * Validates that an input represents an exact, safe integer kobo amount.
 * Rejects NaN, Infinity, fractional kobo, unsafe integers, and negative values (unless allowed).
 */
export function assertValidKobo(
  value: unknown,
  options: FinancialValidationOptions = {},
): number {
  const { fieldName = "amount_kobo" } = options;
  const parsed = parseKoboToBigInt(value, options);

  if (parsed > MAX_SAFE_KOBO_BIGINT || parsed < MIN_SAFE_KOBO_BIGINT) {
    throw new FinancialUnitError(
      "UNSAFE_INTEGER",
      `${fieldName} (${parsed.toString()} kobo) exceeds JavaScript safe integer range.`,
      fieldName,
    );
  }

  const normalized = Number(parsed);
  // Avoid -0
  return normalized === 0 ? 0 : normalized;
}

export function isValidKobo(
  value: unknown,
  options: FinancialValidationOptions = {},
): boolean {
  try {
    assertValidKobo(value, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats an exact integer kobo amount (including BigInt or integer strings beyond
 * Number.MAX_SAFE_INTEGER) as an exact canonical Naira decimal string with 2 decimal places
 * (e.g., `123456n` -> `"1234.56"`). Uses pure BigInt division/modulo with zero float error.
 */
export function koboToNairaString(
  kobo: KoboInput,
  options: FinancialValidationOptions = {},
): string {
  const parsed = parseKoboToBigInt(kobo, options);
  const negative = parsed < 0n;
  const abs = negative ? -parsed : parsed;
  const whole = abs / 100n;
  const remainder = abs % 100n;
  const formatted = `${whole.toString()}.${remainder.toString().padStart(2, "0")}`;
  return negative && abs !== 0n ? `-${formatted}` : formatted;
}

/**
 * Converts an integer kobo amount into a frontend Naira number using exact integer
 * division and decimal string assembly (avoiding binary floating-point scaling artifacts).
 */
export function koboToNaira(
  kobo: KoboInput,
  options: FinancialValidationOptions = {},
): number {
  const safeKobo = assertValidKobo(kobo, options);
  if (safeKobo === 0) return 0;
  const decimalString = koboToNairaString(BigInt(safeKobo), options);
  const naira = Number(decimalString);
  return naira === 0 ? 0 : naira;
}

export function koboToNairaNullable(
  kobo: KoboInput | null | undefined,
  options: FinancialValidationOptions = {},
): number | null {
  if (kobo === null || kobo === undefined) return null;
  return koboToNaira(kobo, options);
}

function normalizeNairaDecimalString(
  naira: unknown,
  fieldName: string,
): string {
  if (typeof naira === "number") {
    if (!Number.isFinite(naira)) {
      throw new FinancialUnitError(
        "NON_FINITE",
        `${fieldName} must be a finite Naira number.`,
        fieldName,
      );
    }
    const raw = String(naira);
    // Reject exponential notation on fractional numbers or values that lose kobo precision
    if (/[eE]/.test(raw)) {
      throw new FinancialUnitError(
        "INVALID_NAIRA_FORMAT",
        `${fieldName} (${raw}) must be passed as a canonical decimal string without scientific notation.`,
        fieldName,
      );
    }
    return raw;
  }

  if (typeof naira === "string") {
    const trimmed = naira.trim();
    if (!trimmed) {
      throw new FinancialUnitError(
        "INVALID_NAIRA_FORMAT",
        `${fieldName} cannot be an empty string.`,
        fieldName,
      );
    }
    return trimmed;
  }

  throw new FinancialUnitError(
    "INVALID_TYPE",
    `${fieldName} must be a finite number or canonical decimal string.`,
    fieldName,
  );
}

/**
 * Converts a Naira value into an exact integer kobo amount using strict decimal-digit
 * integer arithmetic (never `naira * 100` floating-point multiplication).
 * Rejects >2 non-zero fractional digits (sub-kobo / fractional kobo precision).
 */
export function nairaToKobo(
  naira: NairaInput,
  options: FinancialValidationOptions = {},
): number {
  const { allowNegative = false, fieldName = "amount_naira" } = options;
  const canonical = normalizeNairaDecimalString(naira, fieldName);

  const match = NAIRA_DECIMAL_PATTERN.exec(canonical);
  if (!match) {
    throw new FinancialUnitError(
      "INVALID_NAIRA_FORMAT",
      `${fieldName} ("${canonical}") is not a valid Naira decimal amount.`,
      fieldName,
    );
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const wholeDigits = match[2] ?? "0";
  const fracDigitsRaw = match[3] ?? "";

  // Trailing zeros beyond 2 decimals (e.g., "10.500") are mathematically exact;
  // any non-zero digit past 2 decimal places represents fractional kobo and MUST fail.
  if (fracDigitsRaw.length > 2) {
    const extraDigits = fracDigitsRaw.slice(2);
    if (/[1-9]/.test(extraDigits)) {
      throw new FinancialUnitError(
        "SUB_KOBO_PRECISION",
        `${fieldName} ("${canonical}") contains sub-kobo precision (more than 2 decimal places). Fractional kobo is prohibited.`,
        fieldName,
      );
    }
  }

  const fracTwoDigits = fracDigitsRaw.slice(0, 2).padEnd(2, "0");
  const magnitudeKobo = BigInt(wholeDigits) * 100n + BigInt(fracTwoDigits);
  const signedKobo = magnitudeKobo === 0n ? 0n : sign * magnitudeKobo;

  if (!allowNegative && signedKobo < 0n) {
    throw new FinancialUnitError(
      "NEGATIVE_DISALLOWED",
      `${fieldName} cannot be negative (received "${canonical}").`,
      fieldName,
    );
  }

  if (signedKobo > MAX_SAFE_KOBO_BIGINT || signedKobo < MIN_SAFE_KOBO_BIGINT) {
    throw new FinancialUnitError(
      "UNSAFE_INTEGER",
      `${fieldName} ("${canonical}" NGN = ${signedKobo.toString()} kobo) exceeds JavaScript safe integer range.`,
      fieldName,
    );
  }

  const result = Number(signedKobo);
  return result === 0 ? 0 : result;
}

export function nairaToKoboNullable(
  naira: NairaInput | null | undefined,
  options: FinancialValidationOptions = {},
): number | null {
  if (naira === null || naira === undefined) return null;
  return nairaToKobo(naira, options);
}

/**
 * Sums an array of integer kobo values using exact BigInt accumulation and verifies
 * that the total remains within JavaScript safe integer bounds.
 */
export function sumKobo(
  values: ReadonlyArray<KoboInput>,
  options: FinancialValidationOptions = {},
): number {
  let total = 0n;
  for (let i = 0; i < values.length; i += 1) {
    total += parseKoboToBigInt(values[i], {
      ...options,
      fieldName: `${options.fieldName ?? "amount_kobo"}[${i}]`,
    });
  }
  return assertValidKobo(total, options);
}

/**
 * Converts integer basis points (e.g., `1450` bps = `14.5%`) to a display percentage
 * using exact integer arithmetic (`100 bps = 1%`).
 */
export function basisPointsToPercent(
  bps: unknown,
  fieldName = "rate_bps",
): number {
  if (typeof bps !== "number" || !Number.isFinite(bps) || !Number.isInteger(bps)) {
    throw new FinancialUnitError(
      "INVALID_BASIS_POINTS",
      `${fieldName} must be an exact integer number of basis points.`,
      fieldName,
    );
  }
  if (bps < 0 || bps > 100_000) {
    throw new FinancialUnitError(
      "INVALID_BASIS_POINTS",
      `${fieldName} (${bps}) is outside valid basis point bounds (0..100000).`,
      fieldName,
    );
  }
  const whole = Math.trunc(bps / 100);
  const rem = bps % 100;
  return Number(`${whole}.${String(rem).padStart(2, "0")}`);
}

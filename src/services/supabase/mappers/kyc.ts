import type {
  DbKycDocumentRow,
  DbKycRecordRow,
  DbKycReviewRow,
} from "@/services/supabase/dbTypes";
import {
  normalizeKycStatus,
  normalizeKycTier,
  type DbKycStatus,
  type DbKycTier,
} from "@/services/supabase/enums";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
  assertPlainRecord,
  assertPositiveInteger,
  collectWarnings,
  readNullableIsoTimestamp,
  readNullableString,
  readOptionalJsonObject,
} from "@/services/supabase/mappers/shared";
import type { KycSubmissionRecord } from "@/types/domain";

/**
 * SILVER SPOON — Vendor-Agnostic KYC Database Mappers (Phase 6.3)
 *
 * Maps `public.kyc_records`, `public.kyc_documents`, and `public.kyc_reviews` (Migration 0009).
 * SECURITY:
 * - Only masked `bvn_last4` / `nin_last4` and private storage references are mapped.
 * - Salted hashes (`bvn_hash`, `nin_hash`) are NEVER exposed in frontend domain objects.
 */

export interface MappedKycDocument {
  readonly id: string;
  readonly kycRecordId: string;
  readonly userId: string;
  readonly documentType: string;
  readonly storageBucket: string;
  readonly storagePath: string;
  readonly sha256Checksum: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly uploadedAt: string;
  readonly retentionUntil: string;
}

export interface MappedKycReview {
  readonly id: string;
  readonly kycRecordId: string;
  readonly subjectUserId: string;
  readonly reviewerUserId: string;
  readonly decision: string;
  readonly notes: string;
  readonly reviewedAt: string;
}

export interface MappedKycRecord {
  /**
   * Frontend `KycSubmissionRecord` projection for Tier 2 / Tier 3 upgrades.
   * For Tier 0 / Tier 1 baseline records, `submission` is `null` (never fabricated as Tier 2).
   */
  readonly submission: KycSubmissionRecord | null;
  readonly id: string;
  readonly userId: string;
  readonly frontendStatus: KycSubmissionRecord["status"];
  readonly dbMeta: {
    readonly dbTargetTier: DbKycTier | null;
    readonly rawTargetTier: string;
    readonly dbStatus: DbKycStatus | null;
    readonly rawStatus: string;
    readonly vendorCode: string | null;
    readonly vendorReference: string | null;
    readonly bvnLast4: string | null;
    readonly ninLast4: string | null;
    readonly livenessStatus: string;
    readonly pepSanctionsStatus: string;
    readonly submittedAt: string | null;
    readonly verifiedAt: string | null;
    readonly retentionUntil: string;
    readonly metadata: Record<string, unknown>;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly documents: readonly MappedKycDocument[];
    readonly latestReview: MappedKycReview | null;
  };
  readonly warnings: readonly string[];
}

export interface MapKycContext {
  readonly documents?: ReadonlyArray<DbKycDocumentRow | unknown>;
  readonly latestReview?: DbKycReviewRow | unknown | null;
}

export function mapKycDocumentRow(rawRow: DbKycDocumentRow | unknown): MappedKycDocument {
  const row = assertPlainRecord(rawRow, "kyc_documents");
  return {
    id: assertNonEmptyString(row, "id", "kyc_documents"),
    kycRecordId: assertNonEmptyString(row, "kyc_record_id", "kyc_documents"),
    userId: assertNonEmptyString(row, "user_id", "kyc_documents"),
    documentType: assertNonEmptyString(row, "document_type", "kyc_documents"),
    storageBucket: assertNonEmptyString(row, "storage_bucket", "kyc_documents"),
    storagePath: assertNonEmptyString(row, "storage_path", "kyc_documents"),
    sha256Checksum: assertNonEmptyString(row, "sha256_checksum", "kyc_documents"),
    mimeType: assertNonEmptyString(row, "mime_type", "kyc_documents"),
    sizeBytes: assertPositiveInteger(row, "size_bytes", "kyc_documents"),
    uploadedAt: assertIsoTimestamp(row, "uploaded_at", "kyc_documents"),
    retentionUntil: assertIsoTimestamp(row, "retention_until", "kyc_documents"),
  };
}

export function mapKycReviewRow(rawRow: DbKycReviewRow | unknown): MappedKycReview {
  const row = assertPlainRecord(rawRow, "kyc_reviews");
  return {
    id: assertNonEmptyString(row, "id", "kyc_reviews"),
    kycRecordId: assertNonEmptyString(row, "kyc_record_id", "kyc_reviews"),
    subjectUserId: assertNonEmptyString(row, "subject_user_id", "kyc_reviews"),
    reviewerUserId: assertNonEmptyString(row, "reviewer_user_id", "kyc_reviews"),
    decision: assertNonEmptyString(row, "decision", "kyc_reviews"),
    notes: assertNonEmptyString(row, "notes", "kyc_reviews"),
    reviewedAt: assertIsoTimestamp(row, "reviewed_at", "kyc_reviews"),
  };
}

export function mapKycRecordRow(
  rawRow: DbKycRecordRow | unknown,
  context: MapKycContext = {},
): MappedKycRecord {
  const row = assertPlainRecord(rawRow, "kyc_records");

  const id = assertNonEmptyString(row, "id", "kyc_records");
  const userId = assertNonEmptyString(row, "user_id", "kyc_records");
  const rawTargetTier = assertNonEmptyString(row, "target_tier", "kyc_records");
  const rawStatus = assertNonEmptyString(row, "status", "kyc_records");
  const vendorCode = readNullableString(row, "vendor_code", "kyc_records");
  const vendorReference = readNullableString(row, "vendor_reference", "kyc_records");
  const bvnLast4 = readNullableString(row, "bvn_last4", "kyc_records");
  const ninLast4 = readNullableString(row, "nin_last4", "kyc_records");
  const livenessStatus = assertNonEmptyString(row, "liveness_status", "kyc_records");
  const pepSanctionsStatus = assertNonEmptyString(row, "pep_sanctions_status", "kyc_records");
  const submittedAt = readNullableIsoTimestamp(row, "submitted_at", "kyc_records");
  const verifiedAt = readNullableIsoTimestamp(row, "verified_at", "kyc_records");
  const retentionUntil = assertIsoTimestamp(row, "retention_until", "kyc_records");
  const metadata = readOptionalJsonObject(row, "metadata", "kyc_records");
  const createdAt = assertIsoTimestamp(row, "created_at", "kyc_records");
  const updatedAt = assertIsoTimestamp(row, "updated_at", "kyc_records");

  const tierNorm = normalizeKycTier(rawTargetTier);
  const statusNorm = normalizeKycStatus(rawStatus);

  const documents = (context.documents ?? []).map((doc) => mapKycDocumentRow(doc));
  const latestReview = context.latestReview ? mapKycReviewRow(context.latestReview) : null;

  const govIdDoc = documents.find((d) => d.documentType === "government_id");
  const poaDoc = documents.find((d) => d.documentType === "proof_of_address");

  const isUpgradeTier = tierNorm.dbValue === "Tier 2" || tierNorm.dbValue === "Tier 3";
  const submission: KycSubmissionRecord | null = isUpgradeTier
    ? {
        id,
        userId,
        targetTier: tierNorm.dbValue as "Tier 2" | "Tier 3",
        idType: "NIN",
        idNumberLast4: ninLast4 ?? "",
        bvnLast4: bvnLast4 ?? "",
        dateOfBirth: typeof metadata.date_of_birth === "string" ? metadata.date_of_birth : "",
        residentialAddress:
          typeof metadata.residential_address === "string" ? metadata.residential_address : "",
        idDocumentName: govIdDoc?.storagePath ?? "",
        proofOfAddressName: poaDoc?.storagePath,
        submittedAt: submittedAt ?? createdAt,
        status: statusNorm.value,
        reviewerNote: latestReview?.notes,
        reviewedAt: latestReview?.reviewedAt ?? verifiedAt ?? undefined,
        reviewedBy: latestReview?.reviewerUserId,
      }
    : null;

  return {
    submission,
    id,
    userId,
    frontendStatus: statusNorm.value,
    dbMeta: {
      dbTargetTier: tierNorm.dbValue,
      rawTargetTier: tierNorm.raw,
      dbStatus: statusNorm.dbValue,
      rawStatus: statusNorm.raw,
      vendorCode,
      vendorReference,
      bvnLast4,
      ninLast4,
      livenessStatus,
      pepSanctionsStatus,
      submittedAt,
      verifiedAt,
      retentionUntil,
      metadata,
      createdAt,
      updatedAt,
      documents,
      latestReview,
    },
    warnings: collectWarnings(
      tierNorm.warning,
      statusNorm.warning,
      !isUpgradeTier
        ? `kyc_records.target_tier "${rawTargetTier}" is not a Tier 2/Tier 3 upgrade submission; submission projection is null.`
        : null,
    ),
  };
}

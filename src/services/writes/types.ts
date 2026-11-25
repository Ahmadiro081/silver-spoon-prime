import type { DataProviderId } from "@/services/supabase/config";
import type {
  DbAccountStatusCode,
  DbAppRole,
  DbDepositChannel,
  DbKycTier,
  DbRolloverMode,
} from "@/services/supabase/enums";
import type { FourEyesApprovalRecord } from "@/services/writes/fourEyes";
import type { StaffRole } from "@/types/domain";

/**
 * SILVER SPOON — Phase 6.6 Financial & Governance Write-Adapter Standby Contracts
 *
 * ARCHITECTURAL PREPARATION ONLY — NONE OF THESE OPERATIONS EXECUTE IN PHASE 6.6.
 *
 * Non-Negotiable Guarantees:
 * - Zero database writes, zero RPC invocations, zero Edge Function calls,
 *   zero payment provider calls, and zero mock mutation fallbacks.
 * - Monetary inputs are strictly integer kobo (`amountKobo`).
 * - Every standby method deterministically returns `STANDBY_NOT_ENABLED`.
 * - NOT exposed to active UI components during Phase 6.6.
 */

export type WriteOperationCategory =
  | "deposits"
  | "withdrawals"
  | "investments"
  | "kyc"
  | "administration";

export type WriteStandbyStatusCode = "STANDBY_NOT_ENABLED";

export interface AuthenticatedWriteActor {
  readonly actorId: string;
  readonly role: DbAppRole;
}

export interface WriteTargetEntity {
  readonly entityType:
    | "deposit"
    | "withdrawal"
    | "investment"
    | "kyc_record"
    | "user_account"
    | "staff_account"
    | "platform_setting";
  readonly entityId: string;
}

export interface WriteStandbyError {
  readonly code: WriteStandbyStatusCode;
  readonly message: string;
  readonly retryable: false;
  readonly targetBinding: string;
}

/**
 * Deterministic result returned by all Phase 6.6 standby write operations.
 * Guarantees that no write operation can fabricate a successful financial mutation.
 */
export interface WriteStandbyResult<TExpectedPayload = unknown> {
  readonly ok: false;
  readonly status: WriteStandbyStatusCode;
  readonly code: WriteStandbyStatusCode;
  readonly executed: false;
  readonly mutated: false;
  readonly category: WriteOperationCategory;
  readonly operation: string;
  readonly provider: DataProviderId;
  readonly operationReference: string | null;
  readonly idempotencyKey: string | null;
  readonly auditReference: null;
  readonly error: WriteStandbyError;
  /** Type-level anchor for future live implementation payload; always undefined in standby. */
  readonly data?: TExpectedPayload;
}

export interface BaseWriteOperationRequest {
  readonly actor: AuthenticatedWriteActor;
  readonly targetEntity: WriteTargetEntity;
  readonly operationReference: string;
  readonly idempotencyKey: string;
  readonly expectedState: string;
  readonly approval?: FourEyesApprovalRecord;
}

// ── 1. Deposit Write Standby Contracts ────────────────────────────────────────

export interface InitiateDepositWriteRequest extends BaseWriteOperationRequest {
  readonly amountKobo: number;
  readonly currency: "NGN";
  readonly channel: DbDepositChannel;
}

export interface ConfirmDepositWriteRequest extends BaseWriteOperationRequest {
  readonly amountKobo: number;
  readonly serverVerificationRef: string;
}

export interface ReconcileDepositWriteRequest extends BaseWriteOperationRequest {
  readonly settledAmountKobo: number;
  readonly providerSettlementRef: string;
}

export interface DepositWriteExpectedResponse {
  readonly depositId: string;
  readonly transactionId: string;
  readonly status: string;
  readonly amountKobo: number;
}

// ── 2. Withdrawal Write Standby Contracts ─────────────────────────────────────

export interface SubmitWithdrawalWriteRequest extends BaseWriteOperationRequest {
  readonly amountKobo: number;
  readonly destinationBankAccountId: string;
  readonly currency: "NGN";
}

export interface ApproveWithdrawalWriteRequest extends BaseWriteOperationRequest {
  readonly approval: FourEyesApprovalRecord;
  readonly note?: string;
}

export interface RejectWithdrawalWriteRequest extends BaseWriteOperationRequest {
  readonly reason: string;
  readonly approval?: FourEyesApprovalRecord;
}

export interface ExecuteWithdrawalWriteRequest extends BaseWriteOperationRequest {
  readonly approval: FourEyesApprovalRecord;
  readonly withdrawalBatchId: string;
  readonly payoutIdempotencyRef: string;
}

export interface ReconcileWithdrawalWriteRequest extends BaseWriteOperationRequest {
  readonly providerTransferRef: string;
  readonly settledAmountKobo: number;
}

export interface WithdrawalWriteExpectedResponse {
  readonly withdrawalId: string;
  readonly transactionId: string;
  readonly status: string;
  readonly reservedAmountKobo: number;
}

// ── 3. Investment Write Standby Contracts ─────────────────────────────────────

export interface CreateInvestmentWriteRequest extends BaseWriteOperationRequest {
  readonly planId: string;
  readonly principalKobo: number;
  readonly rolloverMode: DbRolloverMode;
}

export interface MatureInvestmentWriteRequest extends BaseWriteOperationRequest {
  readonly approval: FourEyesApprovalRecord;
  readonly realizedReturnKobo: number;
}

export interface ProcessMaturityWriteRequest extends BaseWriteOperationRequest {
  readonly approval: FourEyesApprovalRecord;
  readonly disposition: "settle_to_available" | "rollover_principal_only" | "rollover_compound";
}

export interface ApplyRolloverInstructionWriteRequest extends BaseWriteOperationRequest {
  readonly rolloverMode: DbRolloverMode;
  readonly consentVersion: string;
}

export interface InvestmentWriteExpectedResponse {
  readonly investmentId: string;
  readonly status: string;
  readonly principalKobo: number;
}

// ── 4. KYC Write Standby Contracts ────────────────────────────────────────────

export interface SubmitKycVerificationWriteRequest extends BaseWriteOperationRequest {
  readonly targetTier: Extract<DbKycTier, "Tier 2" | "Tier 3">;
  readonly documentStoragePaths: readonly string[];
}

export interface ApproveKycVerificationWriteRequest extends BaseWriteOperationRequest {
  readonly approvedTier: Extract<DbKycTier, "Tier 2" | "Tier 3">;
  readonly approval: FourEyesApprovalRecord;
}

export interface RejectKycVerificationWriteRequest extends BaseWriteOperationRequest {
  readonly reasonCode: string;
  readonly investorSafeSummary: string;
}

export interface RequestAdditionalKycInfoWriteRequest extends BaseWriteOperationRequest {
  readonly requestedDocuments: readonly string[];
  readonly investorSafeSummary: string;
}

export interface KycWriteExpectedResponse {
  readonly kycRecordId: string;
  readonly status: string;
}

// ── 5. Administration Write Standby Contracts ─────────────────────────────────

export interface CreateStaffAccountWriteRequest extends BaseWriteOperationRequest {
  readonly email: string;
  readonly fullName: string;
  readonly assignedRole: StaffRole;
  readonly approval: FourEyesApprovalRecord;
}

export interface ChangeStaffRoleWriteRequest extends BaseWriteOperationRequest {
  readonly previousRole: StaffRole;
  readonly nextRole: StaffRole;
  readonly approval: FourEyesApprovalRecord;
}

export interface SuspendAccountWriteRequest extends BaseWriteOperationRequest {
  readonly targetStatus: Extract<DbAccountStatusCode, "suspended" | "frozen">;
  readonly reason: string;
}

export interface ReactivateAccountWriteRequest extends BaseWriteOperationRequest {
  readonly approval: FourEyesApprovalRecord;
  readonly reason: string;
}

export interface UpdatePlatformSettingWriteRequest extends BaseWriteOperationRequest {
  readonly settingKey: string;
  readonly valueJson: Record<string, unknown>;
  readonly approval: FourEyesApprovalRecord;
}

export interface AdministrationWriteExpectedResponse {
  readonly entityId: string;
  readonly status: string;
}

// ── Aggregated Financial Write-Adapter Standby Contract ───────────────────────

export interface FinancialWriteStandbyContract {
  readonly mode: "standby_disabled";
  readonly provider: DataProviderId;
  readonly activationAllowed: false;

  readonly deposits: {
    readonly initiateDeposit: (
      request: InitiateDepositWriteRequest,
    ) => Promise<WriteStandbyResult<DepositWriteExpectedResponse>>;
    readonly confirmDeposit: (
      request: ConfirmDepositWriteRequest,
    ) => Promise<WriteStandbyResult<DepositWriteExpectedResponse>>;
    readonly reconcileDeposit: (
      request: ReconcileDepositWriteRequest,
    ) => Promise<WriteStandbyResult<DepositWriteExpectedResponse>>;
  };

  readonly withdrawals: {
    readonly submitWithdrawalRequest: (
      request: SubmitWithdrawalWriteRequest,
    ) => Promise<WriteStandbyResult<WithdrawalWriteExpectedResponse>>;
    readonly approveWithdrawal: (
      request: ApproveWithdrawalWriteRequest,
    ) => Promise<WriteStandbyResult<WithdrawalWriteExpectedResponse>>;
    readonly rejectWithdrawal: (
      request: RejectWithdrawalWriteRequest,
    ) => Promise<WriteStandbyResult<WithdrawalWriteExpectedResponse>>;
    readonly executeWithdrawal: (
      request: ExecuteWithdrawalWriteRequest,
    ) => Promise<WriteStandbyResult<WithdrawalWriteExpectedResponse>>;
    readonly reconcileWithdrawal: (
      request: ReconcileWithdrawalWriteRequest,
    ) => Promise<WriteStandbyResult<WithdrawalWriteExpectedResponse>>;
  };

  readonly investments: {
    readonly createInvestment: (
      request: CreateInvestmentWriteRequest,
    ) => Promise<WriteStandbyResult<InvestmentWriteExpectedResponse>>;
    readonly matureInvestment: (
      request: MatureInvestmentWriteRequest,
    ) => Promise<WriteStandbyResult<InvestmentWriteExpectedResponse>>;
    readonly processMaturity: (
      request: ProcessMaturityWriteRequest,
    ) => Promise<WriteStandbyResult<InvestmentWriteExpectedResponse>>;
    readonly applyRolloverInstruction: (
      request: ApplyRolloverInstructionWriteRequest,
    ) => Promise<WriteStandbyResult<InvestmentWriteExpectedResponse>>;
  };

  readonly kyc: {
    readonly submitVerification: (
      request: SubmitKycVerificationWriteRequest,
    ) => Promise<WriteStandbyResult<KycWriteExpectedResponse>>;
    readonly approveVerification: (
      request: ApproveKycVerificationWriteRequest,
    ) => Promise<WriteStandbyResult<KycWriteExpectedResponse>>;
    readonly rejectVerification: (
      request: RejectKycVerificationWriteRequest,
    ) => Promise<WriteStandbyResult<KycWriteExpectedResponse>>;
    readonly requestAdditionalInformation: (
      request: RequestAdditionalKycInfoWriteRequest,
    ) => Promise<WriteStandbyResult<KycWriteExpectedResponse>>;
  };

  readonly administration: {
    readonly createStaffAccount: (
      request: CreateStaffAccountWriteRequest,
    ) => Promise<WriteStandbyResult<AdministrationWriteExpectedResponse>>;
    readonly changeStaffRole: (
      request: ChangeStaffRoleWriteRequest,
    ) => Promise<WriteStandbyResult<AdministrationWriteExpectedResponse>>;
    readonly suspendAccount: (
      request: SuspendAccountWriteRequest,
    ) => Promise<WriteStandbyResult<AdministrationWriteExpectedResponse>>;
    readonly reactivateAccount: (
      request: ReactivateAccountWriteRequest,
    ) => Promise<WriteStandbyResult<AdministrationWriteExpectedResponse>>;
    readonly updatePermittedPlatformSettings: (
      request: UpdatePlatformSettingWriteRequest,
    ) => Promise<WriteStandbyResult<AdministrationWriteExpectedResponse>>;
  };
}

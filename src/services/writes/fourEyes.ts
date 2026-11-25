import type { StaffRole } from "@/types/domain";

/**
 * SILVER SPOON — Phase 6.6 Four-Eyes Approval Contract & Validation Boundary
 *
 * ARCHITECTURAL PREPARATION ONLY:
 * - Models separation-of-duties approval records for future sensitive financial
 *   and governance operations (withdrawals, investment maturities, bank account
 *   changes, referral payouts, and treasury platform setting changes).
 * - Does NOT implement approval execution, workflow state transitions, or DB writes.
 * - Enforces distinct-actor validation so a single actor can NEVER satisfy
 *   multiple independent approval stages.
 */

export type FourEyesApprovalState =
  | "not_required"
  | "pending_first_approval"
  | "pending_second_approval"
  | "approved"
  | "rejected"
  | "expired";

export interface FourEyesActorRef {
  readonly actorId: string;
  readonly role: StaffRole;
  readonly actedAt?: string;
}

export interface FourEyesRejectionState {
  readonly rejectedBy: FourEyesActorRef;
  readonly rejectedAt: string;
  readonly reason: string;
}

export interface SeparationOfDutiesRequirement {
  readonly requiredDistinctApprovers: 1 | 2;
  readonly initiatorCannotApprove: true;
  readonly allowedFirstApproverRoles: readonly StaffRole[];
  readonly allowedSecondApproverRoles: readonly StaffRole[];
}

export interface FourEyesApprovalRecord {
  readonly actionId: string | null;
  readonly initiatingActor: FourEyesActorRef;
  readonly firstApprover: FourEyesActorRef | null;
  readonly secondApprover: FourEyesActorRef | null;
  readonly approvalState: FourEyesApprovalState;
  readonly rejectionState: FourEyesRejectionState | null;
  readonly separationOfDuties: SeparationOfDutiesRequirement;
  readonly auditReference: string | null;
}

export interface FourEyesBoundaryViolation {
  readonly code:
    | "MISSING_INITIATOR"
    | "SELF_APPROVAL_PROHIBITED"
    | "DUPLICATE_APPROVER_PROHIBITED"
    | "UNAUTHORIZED_FIRST_APPROVER_ROLE"
    | "UNAUTHORIZED_SECOND_APPROVER_ROLE"
    | "INCOMPLETE_APPROVAL_CHAIN"
    | "INCONSISTENT_REJECTION_STATE";
  readonly message: string;
}

export interface FourEyesValidationResult {
  readonly valid: boolean;
  readonly violations: readonly FourEyesBoundaryViolation[];
}

/**
 * Pure structural validation boundary for future four-eyes approval payloads.
 * Never mutates state or executes an approval — validates separation-of-duties invariants only.
 */
export function validateFourEyesApprovalBoundary(
  record: FourEyesApprovalRecord,
): FourEyesValidationResult {
  const violations: FourEyesBoundaryViolation[] = [];
  const initiatorId = record.initiatingActor?.actorId?.trim() ?? "";
  const firstId = record.firstApprover?.actorId?.trim() ?? "";
  const secondId = record.secondApprover?.actorId?.trim() ?? "";

  if (!initiatorId) {
    violations.push({
      code: "MISSING_INITIATOR",
      message: "Initiating actor ID is required for four-eyes approval tracking.",
    });
  }

  if (record.firstApprover) {
    if (firstId && initiatorId && firstId === initiatorId) {
      violations.push({
        code: "SELF_APPROVAL_PROHIBITED",
        message: "Initiating actor cannot act as the first approver (separation of duties).",
      });
    }
    if (
      !record.separationOfDuties.allowedFirstApproverRoles.includes(record.firstApprover.role)
    ) {
      violations.push({
        code: "UNAUTHORIZED_FIRST_APPROVER_ROLE",
        message: `Role "${record.firstApprover.role}" is not permitted for first approval.`,
      });
    }
  }

  if (record.secondApprover) {
    if (secondId && initiatorId && secondId === initiatorId) {
      violations.push({
        code: "SELF_APPROVAL_PROHIBITED",
        message: "Initiating actor cannot act as the second approver (separation of duties).",
      });
    }
    if (secondId && firstId && secondId === firstId) {
      violations.push({
        code: "DUPLICATE_APPROVER_PROHIBITED",
        message: "First and second approvers must be distinct individuals (four-eyes invariant).",
      });
    }
    if (
      !record.separationOfDuties.allowedSecondApproverRoles.includes(record.secondApprover.role)
    ) {
      violations.push({
        code: "UNAUTHORIZED_SECOND_APPROVER_ROLE",
        message: `Role "${record.secondApprover.role}" is not permitted for second approval.`,
      });
    }
  }

  if (record.approvalState === "approved") {
    if (!record.firstApprover) {
      violations.push({
        code: "INCOMPLETE_APPROVAL_CHAIN",
        message: "Approved state requires a recorded first approver.",
      });
    }
    if (record.separationOfDuties.requiredDistinctApprovers === 2 && !record.secondApprover) {
      violations.push({
        code: "INCOMPLETE_APPROVAL_CHAIN",
        message: "Two-person four-eyes approval requires both first and second independent approvers.",
      });
    }
  }

  if (record.approvalState === "rejected" && !record.rejectionState) {
    violations.push({
      code: "INCONSISTENT_REJECTION_STATE",
      message: "Rejected approval state must include structured rejection metadata.",
    });
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Standard separation-of-duties presets aligned with SILVER SPOON treasury governance.
 */
export const FOUR_EYES_PRESETS = Object.freeze({
  withdrawalApproval: Object.freeze<SeparationOfDutiesRequirement>({
    requiredDistinctApprovers: 2,
    initiatorCannotApprove: true,
    allowedFirstApproverRoles: ["finance_officer", "admin", "super_admin"],
    allowedSecondApproverRoles: ["finance_officer", "super_admin"],
  }),
  maturitySettlement: Object.freeze<SeparationOfDutiesRequirement>({
    requiredDistinctApprovers: 2,
    initiatorCannotApprove: true,
    allowedFirstApproverRoles: ["finance_officer", "super_admin"],
    allowedSecondApproverRoles: ["finance_officer", "super_admin"],
  }),
  staffGovernance: Object.freeze<SeparationOfDutiesRequirement>({
    requiredDistinctApprovers: 2,
    initiatorCannotApprove: true,
    allowedFirstApproverRoles: ["super_admin"],
    allowedSecondApproverRoles: ["super_admin"],
  }),
  platformSettingsChange: Object.freeze<SeparationOfDutiesRequirement>({
    requiredDistinctApprovers: 2,
    initiatorCannotApprove: true,
    allowedFirstApproverRoles: ["super_admin"],
    allowedSecondApproverRoles: ["super_admin"],
  }),
  complianceVerification: Object.freeze<SeparationOfDutiesRequirement>({
    requiredDistinctApprovers: 1,
    initiatorCannotApprove: true,
    allowedFirstApproverRoles: ["compliance_officer", "super_admin"],
    allowedSecondApproverRoles: ["compliance_officer", "super_admin"],
  }),
});

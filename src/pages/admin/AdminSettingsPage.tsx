import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { ConfirmDialog } from "@/components/common/Modal";
import { FormAlert } from "@/components/common/Primitives";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";
import { SETTINGS_LIMITS, validatePlatformSettings } from "@/services/platformService";
import type { PlatformSettings } from "@/types/domain";

interface SettingsDraft {
  minDepositAmount: string;
  maxDailyWithdrawal: string;
  autoApproveDepositsUnder: string;
  referralCommissionPercent: string;
  allowNewRegistrations: boolean;
  requireKycForWithdrawals: boolean;
  maintenanceMode: boolean;
}

function toDraft(settings: PlatformSettings): SettingsDraft {
  return {
    minDepositAmount: String(settings.minDepositAmount),
    maxDailyWithdrawal: String(settings.maxDailyWithdrawal),
    autoApproveDepositsUnder: String(settings.autoApproveDepositsUnder),
    referralCommissionPercent: String(settings.referralCommissionPercent),
    allowNewRegistrations: settings.allowNewRegistrations,
    requireKycForWithdrawals: settings.requireKycForWithdrawals,
    maintenanceMode: settings.maintenanceMode,
  };
}

function parseStrictNumber(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return Number.NaN;
  return Number(trimmed);
}

export function AdminSettingsPage() {
  const { settings, resetVersion, adminUpdateSettings, resetDemoState } = useAppState();
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(settings));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  useEffect(() => {
    setDraft(toDraft(settings));
    setValidationError(null);
  }, [settings, resetVersion]);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const candidate: PlatformSettings = {
      ...settings,
      minDepositAmount: parseStrictNumber(draft.minDepositAmount),
      maxDailyWithdrawal: parseStrictNumber(draft.maxDailyWithdrawal),
      autoApproveDepositsUnder: parseStrictNumber(draft.autoApproveDepositsUnder),
      referralCommissionPercent: parseStrictNumber(draft.referralCommissionPercent),
      allowNewRegistrations: draft.allowNewRegistrations,
      requireKycForWithdrawals: draft.requireKycForWithdrawals,
      maintenanceMode: draft.maintenanceMode,
    };

    const preCheck = validatePlatformSettings(candidate);
    if (!preCheck.ok) {
      const msg = preCheck.error ?? "Invalid platform settings configuration.";
      setValidationError(msg);
      toast.error(msg);
      return;
    }

    const res = adminUpdateSettings(candidate);
    if (!res.ok) {
      const msg = res.error ?? "Unable to update platform settings.";
      setValidationError(msg);
      toast.error(msg);
      return;
    }
    setValidationError(null);
    toast.success("Platform operational settings updated and logged.");
  };

  return (
    <AdminDashboardLayout title="Platform Settings" breadcrumb="Settings">
      <div className="max-w-4xl space-y-6">
        <form onSubmit={handleSave} noValidate className="surface-card space-y-6 p-6">
          <div>
            <h2 className="font-display text-xl font-medium text-foreground">
              Treasury & Operational Controls
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Configure Naira funding floors, daily payout ceilings, referral rates, and onboarding
              policies.
            </p>
          </div>

          {validationError && <FormAlert>{validationError}</FormAlert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="set-min-deposit"
                className="block text-xs font-medium text-foreground"
              >
                Minimum Deposit Amount (₦)
              </label>
              <input
                id="set-min-deposit"
                type="number"
                min={SETTINGS_LIMITS.minDepositFloor}
                max={SETTINGS_LIMITS.minDepositCeiling}
                value={draft.minDepositAmount}
                onChange={(e) => {
                  setDraft({ ...draft, minDepositAmount: e.target.value });
                  if (validationError) setValidationError(null);
                }}
                className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label
                htmlFor="set-max-withdrawal"
                className="block text-xs font-medium text-foreground"
              >
                Max Daily Withdrawal Limit (₦)
              </label>
              <input
                id="set-max-withdrawal"
                type="number"
                min={SETTINGS_LIMITS.minDailyWithdrawal}
                max={SETTINGS_LIMITS.maxDailyWithdrawalCeiling}
                value={draft.maxDailyWithdrawal}
                onChange={(e) => {
                  setDraft({ ...draft, maxDailyWithdrawal: e.target.value });
                  if (validationError) setValidationError(null);
                }}
                className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label
                htmlFor="set-auto-approve"
                className="block text-xs font-medium text-foreground"
              >
                Auto-Approve Simulated Deposits Under (₦)
              </label>
              <input
                id="set-auto-approve"
                type="number"
                min={0}
                max={SETTINGS_LIMITS.maxAutoApproveDeposit}
                value={draft.autoApproveDepositsUnder}
                onChange={(e) => {
                  setDraft({ ...draft, autoApproveDepositsUnder: e.target.value });
                  if (validationError) setValidationError(null);
                }}
                className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label
                htmlFor="set-ref-commission"
                className="block text-xs font-medium text-foreground"
              >
                Referral Commission Rate (%)
              </label>
              <input
                id="set-ref-commission"
                type="number"
                step="0.5"
                min={0}
                max={SETTINGS_LIMITS.maxReferralCommissionPercent}
                value={draft.referralCommissionPercent}
                onChange={(e) => {
                  setDraft({ ...draft, referralCommissionPercent: e.target.value });
                  if (validationError) setValidationError(null);
                }}
                className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-5 text-sm">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Allow New Client Registrations</p>
                <p className="text-xs text-muted-foreground">
                  Pause or resume self-serve onboarding on the public registration route.
                </p>
              </div>
              <input
                type="checkbox"
                checked={draft.allowNewRegistrations}
                onChange={(e) => setDraft({ ...draft, allowNewRegistrations: e.target.checked })}
                className="h-4 w-4 shrink-0 accent-primary"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Require Tier 2+ KYC for Withdrawals</p>
                <p className="text-xs text-muted-foreground">
                  Prevent withdrawal requests on unverified Tier 1 profiles.
                </p>
              </div>
              <input
                type="checkbox"
                checked={draft.requireKycForWithdrawals}
                onChange={(e) =>
                  setDraft({ ...draft, requireKycForWithdrawals: e.target.checked })
                }
                className="h-4 w-4 shrink-0 accent-primary"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Maintenance Mode Flag</p>
                <p className="text-xs text-muted-foreground">
                  Operational flag for scheduled treasury maintenance windows.
                </p>
              </div>
              <input
                type="checkbox"
                checked={draft.maintenanceMode}
                onChange={(e) => setDraft({ ...draft, maintenanceMode: e.target.checked })}
                className="h-4 w-4 shrink-0 accent-primary"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              className="h-10 rounded-lg border border-border px-4 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              Clear Local Test Data
            </button>
            <button
              type="submit"
              className="h-10 rounded-lg bg-primary px-6 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Save Platform Settings
            </button>
          </div>
        </form>

        {/* Future Backend Architecture Readiness Card */}
        <section className="surface-card p-6">
          <h2 className="font-display text-xl font-medium text-foreground">
            Backend Integration Readiness
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Current mode is decoupled mock-data architecture. Target production stack configuration:
          </p>
          <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Active Data Provider</dt>
              <dd className="font-tabular mt-0.5 font-semibold text-foreground uppercase">
                {APP_CONFIG.dataProvider}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target Relational Database</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {APP_CONFIG.futureBackend.database}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target Authentication & Isolation</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {APP_CONFIG.futureBackend.authentication}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Authoritative Financial Logic</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {APP_CONFIG.futureBackend.serverLogic}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <ConfirmDialog
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          resetDemoState();
          setConfirmResetOpen(false);
          toast.success("Cleared local test data and reset to a clean empty state.");
        }}
        title="Clear Local Test Data?"
        subtitle="Reset Local Browser Storage"
        description="This immediately removes all locally stored user accounts, simulated transactions, investments, KYC records, and custom settings from this browser, returning the test environment to a clean empty state."
        confirmLabel="Clear All Data"
        tone="destructive"
      />
    </AdminDashboardLayout>
  );
}

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";

export function AdminSettingsPage() {
  const { settings, adminUpdateSettings, resetDemoState } = useAppState();
  const [form, setForm] = useState(settings);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    adminUpdateSettings(form);
    toast.success("Platform operational settings updated and logged.");
  };

  return (
    <AdminDashboardLayout title="Platform Settings" breadcrumb="Settings">
      <div className="max-w-4xl space-y-6">
        <form onSubmit={handleSave} className="surface-card space-y-6 p-6">
          <div>
            <h2 className="font-display text-xl font-medium text-foreground">
              Treasury & Operational Controls
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Configure Naira funding floors, daily payout ceilings, referral rates, and onboarding
              policies.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-foreground">
                Minimum Deposit Amount (₦)
              </label>
              <input
                type="number"
                value={form.minDepositAmount}
                onChange={(e) => setForm({ ...form, minDepositAmount: Number(e.target.value) })}
                className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground">
                Max Daily Withdrawal Limit (₦)
              </label>
              <input
                type="number"
                value={form.maxDailyWithdrawal}
                onChange={(e) => setForm({ ...form, maxDailyWithdrawal: Number(e.target.value) })}
                className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground">
                Auto-Approve Simulated Deposits Under (₦)
              </label>
              <input
                type="number"
                value={form.autoApproveDepositsUnder}
                onChange={(e) =>
                  setForm({ ...form, autoApproveDepositsUnder: Number(e.target.value) })
                }
                className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground">
                Referral Commission Rate (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={form.referralCommissionPercent}
                onChange={(e) =>
                  setForm({ ...form, referralCommissionPercent: Number(e.target.value) })
                }
                className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-5 text-sm">
            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Allow New Client Registrations</p>
                <p className="text-xs text-muted-foreground">
                  Pause or resume self-serve onboarding on the public registration route.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.allowNewRegistrations}
                onChange={(e) => setForm({ ...form, allowNewRegistrations: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </label>

            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Require Tier 2+ KYC for Withdrawals</p>
                <p className="text-xs text-muted-foreground">
                  Prevent withdrawal requests on unverified Tier 1 profiles.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.requireKycForWithdrawals}
                onChange={(e) => setForm({ ...form, requireKycForWithdrawals: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </label>

            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Maintenance Mode Flag</p>
                <p className="text-xs text-muted-foreground">
                  Operational flag for scheduled treasury maintenance windows.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.maintenanceMode}
                onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <button
              type="button"
              onClick={() => {
                resetDemoState();
                toast.success("Restored factory mock ledger data.");
              }}
              className="h-10 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
            >
              Reset Simulated Data
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
    </AdminDashboardLayout>
  );
}

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, KeyRound, MailWarning, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import { useTheme } from "@/context/ThemeContext";
import { formatDateTime } from "@/utils/format";

export function SettingsPage() {
  const { currentUser, updateProfile, changePassword, resetDemoState } = useAppState();
  const { theme, setTheme } = useTheme();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const toggleSetting = (key: "twoFactorEnabled" | "emailAlerts" | "smsAlerts") => {
    const next = !currentUser[key];
    updateProfile({ [key]: next });
    toast.success("Preference updated.");
  };

  const handlePasswordChange = (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError("New password must contain at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    const res = changePassword(currentPassword, newPassword);
    if (!res.ok) {
      setPasswordError(res.error ?? "Unable to update password.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Simulated account password updated.");
  };

  return (
    <UserDashboardLayout title="Account Settings" breadcrumb="Settings">
      <div className="max-w-3xl space-y-6">
        {/* Account Security Overview */}
        <section className="surface-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-medium text-foreground">
                Account Security Overview
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Current verification posture and session telemetry for your SILVER SPOON account.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>

          <dl className="mt-5 grid gap-4 border-t border-border pt-5 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Email Verification</dt>
              <dd className="mt-1">
                {currentUser.emailVerified ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verified ({currentUser.email})
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 font-medium text-warning">
                      <MailWarning className="h-3.5 w-3.5" />
                      Unverified
                    </span>
                    <Link
                      to={`/verify-email?email=${encodeURIComponent(currentUser.email)}`}
                      className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                    >
                      Verify now
                    </Link>
                  </div>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">KYC & Account Status</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="font-medium text-foreground">{currentUser.kycLevel}</span>
                <span className="text-muted-foreground">·</span>
                <StatusText status={currentUser.status} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Two-Factor Safeguard</dt>
              <dd className="mt-1 font-medium text-foreground">
                {currentUser.twoFactorEnabled ? "Enabled (Simulated 2FA)" : "Disabled"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Latest Sign-In</dt>
              <dd className="font-tabular mt-1 font-medium text-foreground">
                {currentUser.lastLoginAt ? formatDateTime(currentUser.lastLoginAt) : "Current session"}
              </dd>
            </div>
          </dl>
        </section>

        {/* Change Password Section */}
        <section className="surface-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-medium text-foreground">Change Password</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Update your simulated login credentials. Demo accounts default to{" "}
                <span className="font-tabular text-foreground">silverspoon2026</span>.
              </p>
            </div>
            <KeyRound className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>

          <form onSubmit={handlePasswordChange} className="mt-5 space-y-4">
            {passwordError && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
              >
                {passwordError}
              </div>
            )}

            <div>
              <label htmlFor="sec-cur-pass" className="block text-xs font-medium text-foreground">
                Current Password
              </label>
              <input
                id="sec-cur-pass"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter current password"
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sec-new-pass" className="block text-xs font-medium text-foreground">
                  New Password
                </label>
                <input
                  id="sec-new-pass"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label
                  htmlFor="sec-confirm-pass"
                  className="block text-xs font-medium text-foreground"
                >
                  Confirm New Password
                </label>
                <input
                  id="sec-confirm-pass"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                Forgot your password?
              </Link>
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Update Password
              </button>
            </div>
          </form>
        </section>

        {/* Security & Communication Preferences */}
        <section className="surface-card divide-y divide-border">
          <div className="p-6">
            <h2 className="font-display text-xl font-medium text-foreground">
              Security & Communication Preferences
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Manage authentication safeguards and ledger notification channels.
            </p>
          </div>

          <SettingRow
            title="Two-Factor Authentication (2FA)"
            description="Require an authenticator code before confirming withdrawal disbursements."
            enabled={currentUser.twoFactorEnabled}
            onToggle={() => toggleSetting("twoFactorEnabled")}
          />
          <SettingRow
            title="Email Settlement Notices"
            description="Receive instant PDF-ready summaries for deposits, allocations, and maturities."
            enabled={currentUser.emailAlerts}
            onToggle={() => toggleSetting("emailAlerts")}
          />
          <SettingRow
            title="SMS Transaction Alerts"
            description="Send Nigerian SMS notifications for withdrawal requests and login events."
            enabled={currentUser.smsAlerts}
            onToggle={() => toggleSetting("smsAlerts")}
          />
        </section>

        <section className="surface-card p-6">
          <h2 className="font-display text-xl font-medium text-foreground">Interface Theme</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose between porcelain light mode and obsidian dark mode.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`h-10 rounded-lg border px-4 text-xs font-medium ${
                theme === "light"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground"
              }`}
            >
              Light Mode
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`h-10 rounded-lg border px-4 text-xs font-medium ${
                theme === "dark"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground"
              }`}
            >
              Dark Mode
            </button>
          </div>
        </section>

        <section className="surface-card p-6">
          <h2 className="font-display text-xl font-medium text-foreground">Mock Data Controls</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Restore initial Naira mock balances, transactions, investments, and audit logs while
            preserving your active role.
          </p>
          <button
            type="button"
            onClick={() => {
              resetDemoState();
              toast.success("Simulated platform data restored to initial defaults.");
            }}
            className="mt-4 inline-flex h-10 items-center rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
          >
            Reset Simulated Data
          </button>
        </section>
      </div>
    </UserDashboardLayout>
  );
}

function SettingRow({
  title,
  description,
  enabled,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          enabled ? "bg-primary" : "bg-secondary border border-border"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-card shadow-subtle transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

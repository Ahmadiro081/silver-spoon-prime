import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, KeyRound, MailWarning, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { ConfirmDialog, Modal } from "@/components/common/Modal";
import { FormAlert, PasswordInput, StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import { useTheme } from "@/context/ThemeContext";
import { formatDateTime } from "@/utils/format";

export function SettingsPage() {
  const {
    currentUser,
    pendingTwoFactorCode,
    updateProfile,
    changePassword,
    requestTwoFactorChallenge,
    enableTwoFactor,
    disableTwoFactor,
    resetDemoState,
  } = useAppState();
  const { theme, setTheme } = useTheme();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // Simulated 2FA enrollment / disable modal states
  const [enable2faOpen, setEnable2faOpen] = useState(false);
  const [enable2faCode, setEnable2faCode] = useState("");
  const [enable2faError, setEnable2faError] = useState<string | null>(null);
  const [enable2faSubmitting, setEnable2faSubmitting] = useState(false);

  const [disable2faOpen, setDisable2faOpen] = useState(false);
  const [disable2faPassword, setDisable2faPassword] = useState("");
  const [disable2faError, setDisable2faError] = useState<string | null>(null);
  const [disable2faSubmitting, setDisable2faSubmitting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const toggleCommunicationSetting = async (key: "emailAlerts" | "smsAlerts") => {
    try {
      const next = !currentUser[key];
      const res = await updateProfile({ [key]: next });
      if (!res.ok) {
        toast.error(res.error ?? "Unable to update preference.");
        return;
      }
      toast.success("Notification preference updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update preference.");
    }
  };

  const handleTwoFactorToggleClick = async () => {
    if (currentUser.twoFactorEnabled) {
      setDisable2faPassword("");
      setDisable2faError(null);
      setDisable2faOpen(true);
      return;
    }
    try {
      const challenge = await requestTwoFactorChallenge("simulated 2FA enrollment");
      if (!challenge.ok) {
        toast.error(challenge.error ?? "Unable to initiate simulated 2FA setup.");
        return;
      }
      setEnable2faCode("");
      setEnable2faError(null);
      setEnable2faOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to initiate simulated 2FA setup.");
    }
  };

  const handleEnableTwoFactorSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (enable2faSubmitting) return;
    setEnable2faError(null);
    setEnable2faSubmitting(true);
    try {
      const res = await enableTwoFactor(enable2faCode);
      if (!res.ok) {
        setEnable2faError(res.error ?? "Unable to enable simulated 2FA.");
        return;
      }
      setEnable2faOpen(false);
      setEnable2faCode("");
      toast.success("Simulated 2FA enabled for withdrawal requests.");
    } catch (err) {
      setEnable2faError(err instanceof Error ? err.message : "Unable to enable simulated 2FA.");
    } finally {
      setEnable2faSubmitting(false);
    }
  };

  const handleDisableTwoFactorSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (disable2faSubmitting) return;
    setDisable2faError(null);
    setDisable2faSubmitting(true);
    try {
      const res = await disableTwoFactor(disable2faPassword);
      if (!res.ok) {
        setDisable2faError(res.error ?? "Unable to disable simulated 2FA.");
        return;
      }
      setDisable2faOpen(false);
      setDisable2faPassword("");
      toast.success("Simulated 2FA disabled.");
    } catch (err) {
      setDisable2faError(err instanceof Error ? err.message : "Unable to disable simulated 2FA.");
    } finally {
      setDisable2faSubmitting(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (passwordSubmitting) return;
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError("New password must contain at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordSubmitting(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      if (!res.ok) {
        setPasswordError(res.error ?? "Unable to update password.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Simulated account password updated.");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Unable to update password.");
    } finally {
      setPasswordSubmitting(false);
    }
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
                Current verification posture and session details for your SILVER SPOON account.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>

          <dl className="mt-5 grid gap-4 border-t border-border pt-5 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Email Verification</dt>
              <dd className="mt-1">
                {currentUser.emailVerified ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Verified ({currentUser.email})
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 font-medium text-warning">
                      <MailWarning className="h-3.5 w-3.5" aria-hidden="true" />
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
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{currentUser.kycLevel}</span>
                <span aria-hidden="true" className="text-muted-foreground">·</span>
                <StatusText status={currentUser.status} />
                {currentUser.role === "investor" && (
                  <Link
                    to="/dashboard/profile#kyc"
                    className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    Manage KYC
                  </Link>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Two-Factor Safeguard (Simulated)</dt>
              <dd className="mt-1 font-medium text-foreground">
                {currentUser.twoFactorEnabled
                  ? "Enabled for withdrawals (Simulated 2FA)"
                  : "Disabled"}
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
                Update the password for your registered account in this test environment.
              </p>
            </div>
            <KeyRound className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>

          <form onSubmit={handlePasswordChange} className="mt-5 space-y-4" noValidate>
            {passwordError && <FormAlert>{passwordError}</FormAlert>}

            <div>
              <label htmlFor="sec-cur-pass" className="block text-xs font-medium text-foreground">
                Current Password
              </label>
              <PasswordInput
                id="sec-cur-pass"
                required
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                autoComplete="current-password"
                placeholder="Enter current password"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sec-new-pass" className="block text-xs font-medium text-foreground">
                  New Password
                </label>
                <PasswordInput
                  id="sec-new-pass"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div>
                <label
                  htmlFor="sec-confirm-pass"
                  className="block text-xs font-medium text-foreground"
                >
                  Confirm New Password
                </label>
                <PasswordInput
                  id="sec-confirm-pass"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
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
                disabled={passwordSubmitting}
                className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {passwordSubmitting ? "Updating..." : "Update Password"}
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
              Manage simulated authentication safeguards and ledger notification channels.
            </p>
          </div>

          <SettingRow
            title="Two-Factor Authentication (Simulated 2FA)"
            description="Require a simulated 6-digit confirmation code before submitting withdrawal requests. Enabling requires code verification; disabling requires your current password. Live TOTP apps and server-side login MFA are pending backend integration."
            enabled={currentUser.twoFactorEnabled}
            onToggle={handleTwoFactorToggleClick}
          />
          <SettingRow
            title="Email Settlement Notices (Preference)"
            description="Record preference for email summaries on deposits, allocations, and maturities (simulated — live email delivery pending backend integration)."
            enabled={currentUser.emailAlerts}
            onToggle={() => toggleCommunicationSetting("emailAlerts")}
          />
          <SettingRow
            title="SMS Transaction Alerts (Preference)"
            description="Record preference for Nigerian SMS notifications on withdrawals and sign-ins (simulated — live SMS gateway pending backend integration)."
            enabled={currentUser.smsAlerts}
            onToggle={() => toggleCommunicationSetting("smsAlerts")}
          />
        </section>

        <section className="surface-card p-6">
          <h2 className="font-display text-xl font-medium text-foreground">Interface Theme</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose between porcelain light mode and obsidian dark mode.
          </p>
          <div className="mt-4 flex flex-wrap gap-3" role="group" aria-label="Interface theme">
            <button
              type="button"
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
              className={`h-10 rounded-lg border px-4 text-xs font-medium transition-colors ${
                theme === "light"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-secondary"
              }`}
            >
              Light Mode
            </button>
            <button
              type="button"
              aria-pressed={theme === "dark"}
              onClick={() => setTheme("dark")}
              className={`h-10 rounded-lg border px-4 text-xs font-medium transition-colors ${
                theme === "dark"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-secondary"
              }`}
            >
              Dark Mode
            </button>
          </div>
        </section>

        <section className="surface-card p-6">
          <h2 className="font-display text-xl font-medium text-foreground">Local Storage Controls</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Clear all locally stored test accounts, simulated transactions, investments, KYC
            submissions, and audit logs from this browser and return to a clean empty state.
          </p>
          <button
            type="button"
            onClick={() => setResetConfirmOpen(true)}
            className="mt-4 inline-flex h-10 items-center rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
          >
            Clear Local Test Data
          </button>
        </section>
      </div>

      {/* Enable Simulated 2FA Modal */}
      <Modal
        open={enable2faOpen}
        onClose={() => setEnable2faOpen(false)}
        title="Enable Simulated Two-Factor Authentication"
        subtitle="Withdrawal Confirmation Safeguard"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleEnableTwoFactorSubmit} className="space-y-4" noValidate>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Confirm enrollment by entering the freshly issued 6-digit simulated code below. Once
            enabled, withdrawal submissions will require a fresh confirmation code. Live TOTP
            authenticator apps and server-side login MFA remain pending backend integration.
          </p>

          <div className="rounded-lg border border-border bg-secondary/35 p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">Simulated Setup Code</span>
              <button
                type="button"
                onClick={async () => {
                  await requestTwoFactorChallenge("simulated 2FA enrollment");
                  setEnable2faCode("");
                  setEnable2faError(null);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Regenerate
              </button>
            </div>
            <p className="font-tabular mt-1.5 text-lg font-semibold tracking-widest text-foreground">
              {pendingTwoFactorCode ?? "------"}
            </p>
          </div>

          {enable2faError && <FormAlert>{enable2faError}</FormAlert>}

          <div>
            <label htmlFor="enable-2fa-code" className="block text-xs font-medium text-foreground">
              Enter 6-Digit Setup Code
            </label>
            <input
              id="enable-2fa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={enable2faCode}
              onChange={(e) => {
                setEnable2faCode(e.target.value.replace(/\D/g, ""));
                if (enable2faError) setEnable2faError(null);
              }}
              placeholder="6-digit code"
              className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setEnable2faOpen(false)}
              className="h-10 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={enable2faCode.length !== 6 || enable2faSubmitting}
              className="h-10 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enable2faSubmitting ? "Enabling..." : "Confirm & Enable 2FA"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Disable Simulated 2FA Modal */}
      <Modal
        open={disable2faOpen}
        onClose={() => setDisable2faOpen(false)}
        title="Disable Simulated Two-Factor Authentication"
        subtitle="Password Confirmation Required"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleDisableTwoFactorSubmit} className="space-y-4" noValidate>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Enter your current account password to disable the simulated 2FA withdrawal confirmation
            step.
          </p>

          {disable2faError && <FormAlert>{disable2faError}</FormAlert>}

          <div>
            <label
              htmlFor="disable-2fa-pass"
              className="block text-xs font-medium text-foreground"
            >
              Current Password
            </label>
            <PasswordInput
              id="disable-2fa-pass"
              required
              value={disable2faPassword}
              onChange={(e) => {
                setDisable2faPassword(e.target.value);
                if (disable2faError) setDisable2faError(null);
              }}
              autoComplete="current-password"
              placeholder="Enter current password"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setDisable2faOpen(false)}
              className="h-10 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!disable2faPassword.trim() || disable2faSubmitting}
              className="h-10 rounded-lg bg-destructive px-5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {disable2faSubmitting ? "Disabling..." : "Disable Simulated 2FA"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        busy={resetting}
        onConfirm={async () => {
          setResetting(true);
          try {
            await resetDemoState();
            setResetConfirmOpen(false);
            toast.success("Local test data cleared. You have been signed out.");
          } finally {
            setResetting(false);
          }
        }}
        title="Clear Local Test Data?"
        subtitle="Reset Browser Storage"
        description="This permanently removes all registered local accounts, simulated deposits, withdrawals, investments, KYC records, and settings from this browser and returns the workspace to a clean empty state."
        confirmLabel="Clear All Data"
        tone="destructive"
      />
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
  onToggle: () => void | Promise<void>;
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div>
        <p id={titleId} className="text-sm font-medium text-foreground">
          {title}
        </p>
        <p id={descriptionId} className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          enabled ? "bg-primary" : "border border-border bg-secondary"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-4 w-4 rounded-full bg-card shadow-subtle transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

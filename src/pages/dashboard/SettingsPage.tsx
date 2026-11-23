import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { useAppState } from "@/context/AppStateContext";
import { useTheme } from "@/context/ThemeContext";

export function SettingsPage() {
  const { currentUser, updateProfile, resetDemoState } = useAppState();
  const { theme, setTheme } = useTheme();

  const toggleSetting = (key: "twoFactorEnabled" | "emailAlerts" | "smsAlerts") => {
    const next = !currentUser[key];
    updateProfile({ [key]: next });
    toast.success("Preference updated.");
  };

  return (
    <UserDashboardLayout title="Account Settings" breadcrumb="Settings">
      <div className="max-w-3xl space-y-6">
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
            Restore initial Naira mock balances, transactions, investments, and audit logs.
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

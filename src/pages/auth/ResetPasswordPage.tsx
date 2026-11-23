import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { useAppState } from "@/context/AppStateContext";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resetPassword } = useAppState();

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }
    const res = resetPassword(email, token, newPassword);
    if (!res.ok) {
      setError(res.error ?? "Unable to reset password.");
      return;
    }
    setError(null);
    setCompleted(true);
    toast.success("Password updated. You can now sign in with your new credentials.");
  };

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Enter your recovery token and choose a new password of at least 8 characters."
      footer={
        <Link to="/login" className="font-semibold text-foreground hover:underline">
          Back to Sign In
        </Link>
      }
    >
      {completed ? (
        <div className="surface-card space-y-4 p-6 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-success" />
          <div>
            <p className="text-sm font-semibold text-foreground">Password Updated</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your simulated credentials for <span className="font-medium text-foreground">{email}</span>{" "}
              have been updated.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign In with New Password
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="rp-email" className="block text-xs font-medium text-foreground">
              Account Email
            </label>
            <input
              id="rp-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="adaeze.okafor@silverspoon.ng"
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="rp-token" className="block text-xs font-medium text-foreground">
              Recovery Token
            </label>
            <input
              id="rp-token"
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="SS-123456"
              className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rp-pass" className="block text-xs font-medium text-foreground">
                New Password
              </label>
              <input
                id="rp-pass"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="rp-confirm" className="block text-xs font-medium text-foreground">
                Confirm Password
              </label>
              <input
                id="rp-confirm"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Confirm New Password
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

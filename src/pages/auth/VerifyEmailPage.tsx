import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Lock, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { FormAlert } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const {
    authenticatedUser,
    pendingVerificationCode,
    requestVerificationCode,
    verifyEmail,
  } = useAppState();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const accountEmail = authenticatedUser?.email ?? "";
  const isAlreadyVerified = Boolean(authenticatedUser?.emailVerified) || verified;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!authenticatedUser) {
      setError("Sign in to your account before verifying your email address.");
      return;
    }
    const res = verifyEmail(authenticatedUser.email, code);
    if (!res.ok) {
      setError(res.error ?? "Verification failed.");
      return;
    }
    setError(null);
    setVerified(true);
    toast.success("Email address verified in simulation mode.");
  };

  const handleIssueCode = () => {
    setError(null);
    const res = requestVerificationCode();
    if (!res.ok || !res.data) {
      setError(res.error ?? "Unable to issue a verification code.");
      return;
    }
    toast.info(`Simulated verification code issued: ${res.data.code}`);
  };

  const workspacePath = authenticatedUser?.role === "admin" ? "/admin" : "/dashboard";

  return (
    <AuthLayout
      title="Verify your email address"
      subtitle="Confirm ownership of your registered email to activate full account notifications."
      footer={
        <Link to="/login" className="font-semibold text-foreground hover:underline">
          Return to Sign In
        </Link>
      }
    >
      {!authenticatedUser ? (
        <div className="surface-card space-y-4 p-6 text-center">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">Sign-In Required</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Email verification can only be completed for your active signed-in SILVER SPOON
              account. Sign in first to request and confirm a verification code.
            </p>
          </div>
          <Link
            to="/login"
            state={{ from: "/verify-email" }}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign In to Continue
          </Link>
        </div>
      ) : isAlreadyVerified ? (
        <div className="surface-card space-y-4 p-6 text-center" role="status">
          <CheckCircle2 className="mx-auto h-9 w-9 text-success" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">Email Verified</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{accountEmail}</span> is verified on
              your SILVER SPOON profile.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(workspacePath)}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Continue to Workspace
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <FormAlert>{error}</FormAlert>}

          <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3.5 text-xs text-muted-foreground">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
            {pendingVerificationCode ? (
              <span>
                Simulated verification code issued for{" "}
                <span className="font-medium text-foreground">{accountEmail}</span>:{" "}
                <span className="font-tabular font-semibold text-foreground">
                  {pendingVerificationCode}
                </span>
                . Enter this exact 6-digit code below to complete verification.
              </span>
            ) : (
              <span>
                No verification code is currently active for your account. Click{" "}
                <span className="font-medium text-foreground">Issue verification code</span> to
                generate a 6-digit simulated code.
              </span>
            )}
          </div>

          <div>
            <label htmlFor="ver-email" className="block text-xs font-medium text-foreground">
              Signed-In Account Email
            </label>
            <input
              id="ver-email"
              type="email"
              readOnly
              disabled
              value={accountEmail}
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3.5 text-sm text-muted-foreground"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="ver-code" className="block text-xs font-medium text-foreground">
                6-Digit Verification Code
              </label>
              <button
                type="button"
                onClick={handleIssueCode}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {pendingVerificationCode ? "Resend code" : "Issue verification code"}
              </button>
            </div>
            <input
              id="ver-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                if (error) setError(null);
              }}
              placeholder="Enter 6-digit code"
              className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Verify Email Address
          </button>

          <button
            type="button"
            onClick={() => navigate(workspacePath)}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Skip for now & open Workspace
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

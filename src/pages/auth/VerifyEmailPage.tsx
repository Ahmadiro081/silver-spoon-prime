import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { useAppState } from "@/context/AppStateContext";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authenticatedUser, verifyEmail } = useAppState();

  const [email, setEmail] = useState(
    searchParams.get("email") ?? authenticatedUser?.email ?? "",
  );
  const [code, setCode] = useState("482910");
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = verifyEmail(email, code);
    if (!res.ok) {
      setError(res.error ?? "Verification failed.");
      return;
    }
    setError(null);
    setVerified(true);
    toast.success("Email address verified in simulation mode.");
  };

  const handleResend = () => {
    const freshCode = String(Math.floor(100000 + Math.random() * 899999));
    setCode(freshCode);
    toast.info(`Simulated verification code dispatched: ${freshCode}`);
  };

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
      {verified ? (
        <div className="surface-card space-y-4 p-6 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-success" />
          <div>
            <p className="text-sm font-semibold text-foreground">Email Verified</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{email}</span> is now verified on your
              SILVER SPOON profile.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              navigate(
                authenticatedUser
                  ? authenticatedUser.role === "admin"
                    ? "/admin"
                    : "/dashboard"
                  : "/login",
              )
            }
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {authenticatedUser ? "Continue to Workspace" : "Proceed to Sign In"}
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

          <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3.5 text-xs text-muted-foreground">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
            <span>
              Simulated verification environment: enter any 6-digit code (default code{" "}
              <span className="font-tabular font-semibold text-foreground">{code}</span>) to confirm
              your email address.
            </span>
          </div>

          <div>
            <label htmlFor="ver-email" className="block text-xs font-medium text-foreground">
              Account Email
            </label>
            <input
              id="ver-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.ng"
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="ver-code" className="block text-xs font-medium text-foreground">
                6-Digit Verification Code
              </label>
              <button
                type="button"
                onClick={handleResend}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Resend code
              </button>
            </div>
            <input
              id="ver-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="482910"
              className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Verify Email Address
          </button>

          {authenticatedUser && (
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Skip for now & open Client Dashboard
            </button>
          )}
        </form>
      )}
    </AuthLayout>
  );
}

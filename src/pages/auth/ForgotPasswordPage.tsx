import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout";
import { FormAlert } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAppState();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = requestPasswordReset(email);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Unable to dispatch recovery token.");
      return;
    }
    setError(null);
    setResetToken(res.data.resetToken);
  };

  return (
    <AuthLayout
      title="Password recovery"
      subtitle="Enter your registered email address to issue a simulated recovery token."
      footer={
        <Link to="/login" className="font-semibold text-foreground hover:underline">
          Return to Sign In
        </Link>
      }
    >
      {resetToken ? (
        <div className="surface-card space-y-4 p-6 text-center" role="status">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">Simulated Recovery Token Issued</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              In production, a time-limited reset link will be emailed to{" "}
              <span className="font-medium text-foreground">{email}</span>. For frontend simulation,
              use the token below:
            </p>
          </div>
          <div className="rounded-lg border border-border bg-secondary/50 px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Simulated Recovery Token</p>
            <p className="font-tabular mt-1 text-base font-semibold tracking-wider text-foreground">
              {resetToken}
            </p>
          </div>
          <Link
            to={`/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetToken)}`}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Continue to Reset Password
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <FormAlert>{error}</FormAlert>}
          <div>
            <label htmlFor="fp-email" className="block text-xs font-medium text-foreground">
              Registered Email
            </label>
            <input
              id="fp-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="name@domain.ng"
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Send Recovery Token
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

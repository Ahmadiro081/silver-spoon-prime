import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setSent(true);
  };

  return (
    <AuthLayout
      title="Reset account password"
      subtitle="Enter your registered email address to simulate a password recovery dispatch."
      footer={
        <Link to="/login" className="font-semibold text-foreground hover:underline">
          Return to Sign In
        </Link>
      }
    >
      {sent ? (
        <div className="surface-card p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
          <p className="mt-3 text-sm font-semibold text-foreground">Recovery Link Queued</p>
          <p className="mt-1 text-xs text-muted-foreground">
            In production with Supabase Auth, a time-limited reset link will be emailed to{" "}
            <span className="font-medium text-foreground">{email}</span>.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fp-email" className="block text-xs font-medium text-foreground">
              Registered Email
            </label>
            <input
              id="fp-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="adaeze.okafor@silverspoon.ng"
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Send Reset Instructions
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

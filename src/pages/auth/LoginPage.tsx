import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { FormAlert, PasswordInput } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAppState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fromPath = (location.state as { from?: string } | null)?.from;

  const resolveDestination = (role: "investor" | "admin") => {
    if (fromPath) {
      if (role === "admin" && fromPath.startsWith("/admin")) return fromPath;
      if (role === "investor" && fromPath.startsWith("/dashboard")) return fromPath;
    }
    return role === "admin" ? "/admin" : "/dashboard";
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = login(email, password);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Invalid email or password.");
      return;
    }
    setError(null);
    toast.success(`Welcome back, ${res.data.fullName}`);
    navigate(resolveDestination(res.data.role), { replace: true });
  };

  return (
    <AuthLayout
      title="Sign in to SILVER SPOON"
      subtitle="Access your Naira wallet ledger, active investment mandates, or operations console."
      footer={
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span>
            New to SILVER SPOON?{" "}
            <Link to="/register" className="font-semibold text-foreground hover:underline">
              Open an account
            </Link>
          </span>
          <span aria-hidden="true" className="text-border">·</span>
          <Link to="/verify-email" className="font-medium text-muted-foreground hover:text-foreground">
            Verify email
          </Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <FormAlert>{error}</FormAlert>}

        <div>
          <label htmlFor="login-email" className="block text-xs font-medium text-foreground">
            Email Address
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="name@domain.ng"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            required
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="block text-xs font-medium text-foreground">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            required
            className="bg-card"
          />
        </div>

        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Sign In
        </button>
      </form>

      <div className="mt-6 rounded-xl border border-border bg-secondary/40 px-4 py-3.5 text-xs leading-relaxed text-muted-foreground">
        No accounts are preloaded in this environment.{" "}
        <Link to="/register" className="font-semibold text-foreground underline underline-offset-4">
          Register a new client account
        </Link>{" "}
        to create your own isolated Naira wallet and test simulated deposits, mandates, and
        withdrawals.
      </div>
    </AuthLayout>
  );
}

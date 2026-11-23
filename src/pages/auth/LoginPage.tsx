import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { useAppState } from "@/context/AppStateContext";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, switchRoleDemo } = useAppState();
  const [email, setEmail] = useState("adaeze.okafor@silverspoon.ng");
  const [password, setPassword] = useState("silverspoon2026");
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

  const enterDemo = (role: "investor" | "admin") => {
    setError(null);
    switchRoleDemo(role);
    toast.success(
      role === "admin" ? "Signed into Demo Administrator Console" : "Signed into Demo Client Dashboard",
    );
    navigate(resolveDestination(role), { replace: true });
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
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-xs leading-relaxed text-destructive"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="block text-xs font-medium text-foreground">
            Email Address
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
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
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            required
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Sign In
        </button>
      </form>

      <div className="mt-6 border-t border-border pt-6">
        <p className="text-xs font-medium text-muted-foreground">
          Dedicated Demo Accounts (Simulated Access)
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => enterDemo("investor")}
            className="flex flex-col items-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:bg-secondary"
          >
            <span className="text-xs font-semibold text-foreground">Demo Investor Login</span>
            <span className="mt-0.5 text-[11px] text-muted-foreground">Adaeze Okafor · Client</span>
          </button>
          <button
            type="button"
            onClick={() => enterDemo("admin")}
            className="flex flex-col items-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:bg-secondary"
          >
            <span className="text-xs font-semibold text-foreground">Demo Admin Login</span>
            <span className="mt-0.5 text-[11px] text-muted-foreground">
              Oluwaseun Adeyemi · Ops
            </span>
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Demo password for seeded accounts:{" "}
          <span className="font-tabular font-medium text-foreground">silverspoon2026</span>
        </p>
      </div>
    </AuthLayout>
  );
}

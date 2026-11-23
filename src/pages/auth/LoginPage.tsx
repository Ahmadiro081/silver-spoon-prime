import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { useAppState } from "@/context/AppStateContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, switchRoleDemo } = useAppState();
  const [email, setEmail] = useState("adaeze.okafor@silverspoon.ng");
  const [password, setPassword] = useState("silverspoon2026");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = login(email, password);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Unable to sign in.");
      return;
    }
    setError(null);
    toast.success(`Welcome back, ${res.data.fullName}`);
    navigate(res.data.role === "admin" ? "/admin" : "/dashboard");
  };

  const enterDemo = (role: "investor" | "admin") => {
    switchRoleDemo(role);
    toast.success(role === "admin" ? "Signed into Administrator Console" : "Signed into Client Dashboard");
    navigate(role === "admin" ? "/admin" : "/dashboard");
  };

  return (
    <AuthLayout
      title="Sign in to SILVER SPOON"
      subtitle="Access your Naira wallet ledger, active investment mandates, or operations console."
      footer={
        <>
          New to SILVER SPOON?{" "}
          <Link to="/register" className="font-semibold text-foreground hover:underline">
            Open an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="login-email" className="block text-xs font-medium text-foreground">
            Email Address
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
        <p className="text-xs font-medium text-muted-foreground">Instant Demo Workspace Access</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => enterDemo("investor")}
            className="h-10 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Client Dashboard
          </button>
          <button
            type="button"
            onClick={() => enterDemo("admin")}
            className="h-10 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Admin Console
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}

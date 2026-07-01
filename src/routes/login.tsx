import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/layouts/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — SILVER SPOON" }] }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      toast.success("Welcome back, Adaeze");
      navigate({ to: "/dashboard" });
    }, 700);
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your SILVER SPOON account."
      footer={<>New here? <Link to="/register" className="font-medium text-foreground hover:underline">Open an account</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" required placeholder="you@example.com" defaultValue="adaeze.okafor@silverspoon.ng" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Password</Label>
            <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">Forgot?</Link>
          </div>
          <Input type="password" required placeholder="••••••••" defaultValue="demo1234" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox defaultChecked /> Remember this device
        </label>
        <Button type="submit" disabled={loading} className="w-full rounded-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/layouts/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Open account — SILVER SPOON" }] }),
  component: Register,
});

function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      toast.success("Account created", { description: "Check your inbox to verify your email." });
      navigate({ to: "/verify-email" });
    }, 700);
  };

  return (
    <AuthShell
      title="Open your account"
      subtitle="Start investing in under 3 minutes."
      footer={<>Already registered? <Link to="/login" className="font-medium text-foreground hover:underline">Sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>First name</Label><Input required placeholder="Ada" /></div>
          <div className="space-y-1.5"><Label>Last name</Label><Input required placeholder="Okafor" /></div>
        </div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" required placeholder="you@example.com" /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" required placeholder="+234 803 000 0000" /></div>
        <div className="space-y-1.5"><Label>Password</Label><Input type="password" required minLength={8} placeholder="Minimum 8 characters" /></div>
        <p className="text-xs text-muted-foreground">
          By continuing you agree to our <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.
        </p>
        <Button type="submit" disabled={loading} className="w-full rounded-full">
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}

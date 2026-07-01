import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/layouts/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormEvent } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — SILVER SPOON" }] }),
  component: Forgot,
});

function Forgot() {
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    toast.success("Reset link sent", { description: "Check your inbox for further instructions." });
  };
  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="We'll email you a secure reset link."
      footer={<><Link to="/login" className="font-medium text-foreground hover:underline">Back to sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" required placeholder="you@example.com" /></div>
        <Button type="submit" className="w-full rounded-full">Send reset link</Button>
      </form>
    </AuthShell>
  );
}

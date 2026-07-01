import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/layouts/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormEvent } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "New password — SILVER SPOON" }] }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    toast.success("Password updated");
    navigate({ to: "/login" });
  };
  return (
    <AuthShell
      title="Set a new password"
      subtitle="Pick something you'll remember — or a passphrase you won't."
      footer={<Link to="/login" className="font-medium text-foreground hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5"><Label>New password</Label><Input type="password" required minLength={8} /></div>
        <div className="space-y-1.5"><Label>Confirm password</Label><Input type="password" required minLength={8} /></div>
        <Button type="submit" className="w-full rounded-full">Update password</Button>
      </form>
    </AuthShell>
  );
}

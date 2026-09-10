import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/layouts/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Open account — SILVER SPOON" }] }),
  component: Register,
});

function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ first: "", last: "", email: "", phone: "", password: "" });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: `${form.first} ${form.last}`.trim(), phone: form.phone },
      },
    });
    setLoading(false);
    if (error) {
      toast.error("Could not create account", { description: error.message });
      return;
    }
    if (data.session) {
      toast.success("Account created");
      navigate({ to: "/dashboard" });
      return;
    }
    toast.success("Account created", { description: "Check your inbox to verify your email." });
    navigate({ to: "/verify-email" });
  };

  return (
    <AuthShell
      title="Open your account"
      subtitle="Start investing in under 3 minutes."
      footer={<>Already registered? <Link to="/login" className="font-medium text-foreground hover:underline">Sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>First name</Label><Input required placeholder="Ada" value={form.first} onChange={set("first")} /></div>
          <div className="space-y-1.5"><Label>Last name</Label><Input required placeholder="Okafor" value={form.last} onChange={set("last")} /></div>
        </div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" required placeholder="you@example.com" value={form.email} onChange={set("email")} /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" required placeholder="+234 803 000 0000" value={form.phone} onChange={set("phone")} /></div>
        <div className="space-y-1.5"><Label>Password</Label><Input type="password" required minLength={8} placeholder="At least 8 characters" value={form.password} onChange={set("password")} /></div>
        <Button type="submit" disabled={loading} className="w-full rounded-full">
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}

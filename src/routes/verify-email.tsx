import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/layouts/AuthShell";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/verify-email")({
  head: () => ({ meta: [{ title: "Verify email — SILVER SPOON" }] }),
  component: Verify,
});

function Verify() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return toast.error("Enter the 6-digit code");
    toast.success("Email verified");
    navigate({ to: "/dashboard" });
  };
  return (
    <AuthShell
      title="Verify your email"
      subtitle="Enter the 6-digit code sent to your inbox."
      footer={<Link to="/login" className="font-medium text-foreground hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={code} onChange={setCode}>
            <InputOTPGroup>
              {[0,1,2,3,4,5].map((i) => <InputOTPSlot key={i} index={i} />)}
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button type="submit" className="w-full rounded-full">Verify email</Button>
        <p className="text-center text-xs text-muted-foreground">Didn't receive it? <button type="button" className="text-foreground hover:underline" onClick={() => toast("New code sent")}>Resend</button></p>
      </form>
    </AuthShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currentUser } from "@/lib/mock-data";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import type { FormEvent } from "react";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  head: () => ({ meta: [{ title: "Profile — SILVER SPOON" }] }),
  component: Profile,
});

function Profile() {
  const save = (e: FormEvent, section: string) => {
    e.preventDefault();
    toast.success(`${section} updated`);
  };
  return (
    <DashboardLayout title="Profile">
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="card-premium p-6 text-center">
          <div className="relative mx-auto h-28 w-28">
            <div className="grid h-28 w-28 place-items-center rounded-full bg-gradient-ink font-display text-3xl text-primary-foreground">
              {currentUser.name.split(" ").map((n) => n[0]).join("")}
            </div>
            <button className="absolute bottom-1 right-1 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-lift">
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <p className="font-display mt-4 text-xl">{currentUser.name}</p>
          <p className="text-sm text-muted-foreground">{currentUser.email}</p>
          <div className="mt-4 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
            Referral code<br />
            <span className="font-mono font-semibold text-foreground">{currentUser.referralCode}</span>
          </div>
        </div>

        <div className="space-y-6">
          <form onSubmit={(e) => save(e, "Personal details")} className="card-premium p-6">
            <h3 className="font-display text-lg">Personal details</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Full name" defaultValue={currentUser.name} />
              <Field label="Email" type="email" defaultValue={currentUser.email} />
              <Field label="Phone number" defaultValue={currentUser.phone} />
              <Field label="Address" defaultValue={currentUser.address} />
            </div>
            <Button type="submit" className="mt-6 rounded-full">Save changes</Button>
          </form>

          <form onSubmit={(e) => save(e, "Bank details")} className="card-premium p-6">
            <h3 className="font-display text-lg">Bank details</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Bank" defaultValue={currentUser.bank} />
              <Field label="Account number" defaultValue={currentUser.account} />
              <Field label="Account name" defaultValue={currentUser.accountName} />
            </div>
            <Button type="submit" className="mt-6 rounded-full">Update bank</Button>
          </form>

          <form onSubmit={(e) => save(e, "Password")} className="card-premium p-6">
            <h3 className="font-display text-lg">Change password</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Current password" type="password" />
              <Field label="New password" type="password" />
              <Field label="Confirm password" type="password" />
            </div>
            <Button type="submit" className="mt-6 rounded-full">Update password</Button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input {...props} />
    </div>
  );
}

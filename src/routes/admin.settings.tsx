import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { FormEvent } from "react";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — Admin" }] }),
  component: () => {
    const save = (e: FormEvent) => { e.preventDefault(); toast.success("Settings saved"); };
    return (
      <AdminLayout title="Platform settings">
        <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
          <div className="card-premium p-6">
            <h3 className="font-display text-lg">Company</h3>
            <div className="mt-4 space-y-3">
              <F label="Legal name" defaultValue="Silver Spoon Capital Ltd." />
              <F label="Support email" defaultValue="support@silverspoon.ng" />
              <F label="Support phone" defaultValue="+234 700 000 0000" />
            </div>
          </div>
          <div className="card-premium p-6">
            <h3 className="font-display text-lg">Financial</h3>
            <div className="mt-4 space-y-3">
              <F label="Minimum deposit (₦)" type="number" defaultValue="1000" />
              <F label="Minimum withdrawal (₦)" type="number" defaultValue="5000" />
              <F label="Referral bonus (%)" type="number" defaultValue="5" />
            </div>
          </div>
          <div className="card-premium p-6 lg:col-span-2">
            <h3 className="font-display text-lg">Feature flags</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <T label="Enable new registrations" defaultChecked />
              <T label="Enable withdrawals" defaultChecked />
              <T label="Require 2FA for admins" defaultChecked />
              <T label="Maintenance mode" />
            </div>
          </div>
          <div className="lg:col-span-2">
            <Button type="submit" className="rounded-full">Save changes</Button>
          </div>
        </form>
      </AdminLayout>
    );
  },
});

function F({ label, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input {...p} /></div>;
}
function T({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  return <div className="flex items-center justify-between rounded-xl border border-border p-3"><Label className="font-normal">{label}</Label><Switch defaultChecked={defaultChecked} /></div>;
}

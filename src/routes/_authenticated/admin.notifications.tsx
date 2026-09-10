import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { notifications } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { FormEvent } from "react";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Admin" }] }),
  component: () => {
    const send = (e: FormEvent) => {
      e.preventDefault();
      toast.success("Broadcast queued to 12,486 users");
      (e.target as HTMLFormElement).reset();
    };
    return (
      <AdminLayout title="Notifications">
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="card-premium p-6">
            <h2 className="font-display text-xl">Recent broadcasts</h2>
            <ul className="mt-4 divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id} className="py-3">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{n.time}</p>
                </li>
              ))}
            </ul>
          </div>
          <form onSubmit={send} className="card-premium h-fit p-6">
            <h2 className="font-display text-xl">New broadcast</h2>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5"><Label>Title</Label><Input required placeholder="Scheduled maintenance" /></div>
              <div className="space-y-1.5"><Label>Message</Label><Textarea required rows={5} placeholder="We will be performing routine maintenance…" /></div>
              <Button type="submit" className="w-full rounded-full">Send to all users</Button>
            </div>
          </form>
        </div>
      </AdminLayout>
    );
  },
});

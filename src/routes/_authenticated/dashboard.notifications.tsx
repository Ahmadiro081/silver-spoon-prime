import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { notifications } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp, Users, Shield, Check } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard/notifications")({
  head: () => ({ meta: [{ title: "Notifications — SILVER SPOON" }] }),
  component: NotificationsPage,
});

const icons = {
  deposit: ArrowDownToLine,
  withdrawal: ArrowUpFromLine,
  investment: TrendingUp,
  referral: Users,
  system: Shield,
} as const;

function NotificationsPage() {
  const [items, setItems] = useState(notifications);
  const markAll = () => setItems((xs) => xs.map((x) => ({ ...x, unread: false })));
  return (
    <DashboardLayout title="Notifications">
      <div className="card-premium p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl">Inbox</h2>
            <p className="text-sm text-muted-foreground">{items.filter((x) => x.unread).length} unread</p>
          </div>
          <Button variant="outline" size="sm" onClick={markAll}><Check className="mr-2 h-4 w-4" /> Mark all read</Button>
        </div>
        <ul className="mt-6 divide-y divide-border">
          {items.map((n) => {
            const Icon = icons[n.kind];
            return (
              <li key={n.id} className="flex gap-4 py-4">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${n.unread ? "bg-gradient-ink text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{n.title}</p>
                    {n.unread && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{n.time}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </DashboardLayout>
  );
}

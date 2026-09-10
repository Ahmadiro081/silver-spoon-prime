import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { plans } from "@/lib/mock-data";
import { formatNaira } from "@/lib/format";
import { Pencil, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => ({ meta: [{ title: "Plans — Admin" }] }),
  component: PlansAdmin,
});

function PlansAdmin() {
  return (
    <AdminLayout title="Investment plans">
      <div className="flex justify-end">
        <Button className="rounded-full"><Plus className="mr-2 h-4 w-4" /> New plan</Button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className="card-premium p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-xl">{p.name}</h3>
                <p className="text-xs text-muted-foreground">{p.tagline}</p>
              </div>
              <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
            </div>
            <dl className="mt-4 space-y-1 text-sm">
              <Row k="ROI" v={p.roi} />
              <Row k="Duration" v={p.duration} />
              <Row k="Minimum" v={formatNaira(p.min)} />
              <Row k="Maximum" v={formatNaira(p.max)} />
              <Row k="Risk" v={p.risk} />
              <Row k="Status" v={<span className="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">Active</span>} />
            </dl>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

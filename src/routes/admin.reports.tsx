import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({ meta: [{ title: "Reports — Admin" }] }),
  component: () => (
    <AdminLayout title="Reports">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          { name: "Monthly financial statement", date: "July 2026", size: "1.2 MB" },
          { name: "User growth report", date: "Q2 2026", size: "820 KB" },
          { name: "Compliance & KYC log", date: "July 2026", size: "460 KB" },
          { name: "Investment performance", date: "H1 2026", size: "2.1 MB" },
          { name: "Referral programme", date: "July 2026", size: "310 KB" },
          { name: "Audit trail", date: "July 2026", size: "3.4 MB" },
        ].map((r) => (
          <div key={r.name} className="card-premium p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"><FileText className="h-4 w-4" /></span>
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.date} · {r.size}</p>
              </div>
            </div>
            <Button variant="outline" className="mt-4 w-full rounded-full" onClick={() => toast.success("Report downloaded")}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
          </div>
        ))}
      </div>
    </AdminLayout>
  ),
});

import { Download } from "lucide-react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { useAppState } from "@/context/AppStateContext";
import { formatNaira } from "@/utils/format";

export function AdminReportsPage() {
  const { users, transactions, investments, referrals, auditLogs } = useAppState();

  const downloadCsv = (filename: string, csvContent: string, label: string) => {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${label}.`);
  };

  const reports = [
    {
      title: "Treasury Cashflow & Settlement Report",
      description: "Complete ledger of simulated Naira deposits, withdrawals, fees, and approval timestamps.",
      count: `${transactions.length} records`,
      onExport: () => {
        const header = "Reference,Client,Type,Channel,Amount,Fee,Status,CreatedAt\n";
        const body = transactions
          .map(
            (t) =>
              `"${t.reference}","${t.userName}","${t.type}","${t.channel}",${t.amount},${t.fee},"${t.status}","${t.createdAt}"`,
          )
          .join("\n");
        downloadCsv("silver-spoon-treasury-report.csv", header + body, "Treasury Report");
      },
    },
    {
      title: "Investment Mandate Allocation Schedule",
      description: "Open and matured investor positions with principal, target rates, and maturity dates.",
      count: `${investments.length} allocations`,
      onExport: () => {
        const header = "ID,Investor,Plan,Principal,TargetPercent,ProjectedReturn,Status,MaturesAt\n";
        const body = investments
          .map(
            (i) =>
              `"${i.id}","${i.userName}","${i.planName}",${i.principal},${i.targetReturnPercent},${i.projectedReturn},"${i.status}","${i.maturesAt}"`,
          )
          .join("\n");
        downloadCsv("silver-spoon-investments-report.csv", header + body, "Investments Schedule");
      },
    },
    {
      title: "Client Directory & KYC Registry",
      description: "Investor profiles, tiers, KYC verification levels, and account status breakdown.",
      count: `${users.filter((u) => u.role === "investor").length} clients`,
      onExport: () => {
        const header = "ID,Name,Email,Tier,KYC,Status,City,JoinedAt\n";
        const body = users
          .filter((u) => u.role === "investor")
          .map(
            (u) =>
              `"${u.id}","${u.fullName}","${u.email}","${u.tier}","${u.kycLevel}","${u.status}","${u.city}","${u.joinedAt}"`,
          )
          .join("\n");
        downloadCsv("silver-spoon-clients-registry.csv", header + body, "Client Registry");
      },
    },
    {
      title: "Referral Commission & Compliance Audit Export",
      description: "Combined referral attribution and immutable administrative audit trail records.",
      count: `${referrals.length} referrals · ${auditLogs.length} audit logs`,
      onExport: () => {
        const header = "Timestamp,Actor,Role,Action,Target,Summary,Severity\n";
        const body = auditLogs
          .map(
            (a) =>
              `"${a.timestamp}","${a.actorName}","${a.actorRole}","${a.action}","${a.targetId}","${a.summary.replace(/"/g, "'")}","${a.severity}"`,
          )
          .join("\n");
        downloadCsv("silver-spoon-audit-report.csv", header + body, "Audit Export");
      },
    },
  ];

  const totalDeposits = transactions
    .filter((t) => t.type === "Deposit" && t.status === "Completed")
    .reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = transactions
    .filter((t) => t.type === "Withdrawal" && t.status === "Completed")
    .reduce((s, t) => s + t.amount, 0);
  const totalActiveMandates = investments
    .filter((i) => i.status === "Active")
    .reduce((s, i) => s + i.principal, 0);

  return (
    <AdminDashboardLayout title="Financial Reports" breadcrumb="Reports">
      <div className="space-y-6">
        <section className="surface-card p-6">
          <h2 className="font-display text-xl font-medium text-foreground">
            Executive Naira Summary
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Live snapshot generated from the current simulated ledger state
          </p>
          <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Confirmed Deposits</dt>
              <dd className="font-tabular mt-1 text-xl font-semibold text-foreground">
                {formatNaira(totalDeposits)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Completed Withdrawals</dt>
              <dd className="font-tabular mt-1 text-xl font-semibold text-foreground">
                {formatNaira(totalWithdrawals)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Locked Mandate Principal</dt>
              <dd className="font-tabular mt-1 text-xl font-semibold text-foreground">
                {formatNaira(totalActiveMandates)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          {reports.map((rep) => (
            <div key={rep.title} className="surface-card flex flex-col justify-between p-6">
              <div>
                <p className="font-tabular text-xs text-muted-foreground">{rep.count}</p>
                <h3 className="font-display mt-2 text-xl font-medium text-foreground">
                  {rep.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{rep.description}</p>
              </div>
              <div className="mt-6">
                <button
                  type="button"
                  onClick={rep.onExport}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download CSV
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </AdminDashboardLayout>
  );
}

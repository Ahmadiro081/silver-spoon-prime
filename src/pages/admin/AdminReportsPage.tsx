import { Download } from "lucide-react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { useAppState } from "@/context/AppStateContext";
import { buildCsvContent, buildMultiSectionCsv, downloadCsvFile } from "@/utils/csv";
import { formatNaira } from "@/utils/format";

export function AdminReportsPage() {
  const { users, transactions, investments, referrals, auditLogs } = useAppState();

  const triggerDownload = (filename: string, csvContent: string, label: string) => {
    downloadCsvFile(filename, csvContent);
    toast.success(`Downloaded ${label}.`);
  };

  const reports = [
    {
      title: "Treasury Cashflow & Settlement Report",
      description:
        "Complete ledger of simulated Naira deposits, withdrawals, fees, and approval timestamps.",
      count: `${transactions.length} records`,
      recordCount: transactions.length,
      onExport: () => {
        const csvContent = buildCsvContent(
          [
            "Ledger Mode",
            "Reference",
            "Client",
            "Type",
            "Channel",
            "Amount (NGN)",
            "Fee (NGN)",
            "Status",
            "Note",
            "CreatedAt",
          ],
          transactions.map((t) => [
            "SIMULATED TRANSACTION (TEST ENVIRONMENT)",
            t.reference,
            t.userName,
            t.type,
            t.channel,
            t.amount,
            t.fee,
            t.status,
            t.note ?? "",
            t.createdAt,
          ]),
        );
        triggerDownload(
          "silver-spoon-simulated-treasury-report.csv",
          csvContent,
          "Simulated Treasury Report",
        );
      },
    },
    {
      title: "Investment Mandate Allocation Schedule",
      description:
        "Open and matured investor positions with principal, target rates, and maturity dates.",
      count: `${investments.length} allocations`,
      recordCount: investments.length,
      onExport: () => {
        const csvContent = buildCsvContent(
          [
            "Ledger Mode",
            "ID",
            "Investor",
            "Plan",
            "Principal (NGN)",
            "TargetPercent",
            "ProjectedReturn (NGN)",
            "Status",
            "MaturesAt",
          ],
          investments.map((i) => [
            "SIMULATED TRANSACTION (TEST ENVIRONMENT)",
            i.id,
            i.userName,
            i.planName,
            i.principal,
            i.targetReturnPercent,
            i.projectedReturn,
            i.status,
            i.maturesAt,
          ]),
        );
        triggerDownload(
          "silver-spoon-simulated-investments-report.csv",
          csvContent,
          "Simulated Investments Schedule",
        );
      },
    },
    {
      title: "Client Directory & KYC Registry",
      description: "Investor profiles, tiers, KYC verification levels, and account status breakdown.",
      count: `${users.filter((u) => u.role === "investor").length} clients`,
      recordCount: users.filter((u) => u.role === "investor").length,
      onExport: () => {
        const csvContent = buildCsvContent(
          ["ID", "Name", "Email", "Tier", "KYC", "Status", "City", "JoinedAt"],
          users
            .filter((u) => u.role === "investor")
            .map((u) => [
              u.id,
              u.fullName,
              u.email,
              u.tier,
              u.kycLevel,
              u.status,
              u.city,
              u.joinedAt,
            ]),
        );
        triggerDownload("silver-spoon-clients-registry.csv", csvContent, "Client Registry");
      },
    },
    {
      title: "Referral Commission & Compliance Audit Export",
      description:
        "Separated and labeled export of referral commission attribution records and administrative audit trail events.",
      count: `${referrals.length} referrals · ${auditLogs.length} audit logs`,
      recordCount: referrals.length + auditLogs.length,
      onExport: () => {
        const csvContent = buildMultiSectionCsv([
          {
            title: "SECTION 1: REFERRAL COMMISSION RECORDS",
            headers: [
              "Referral ID",
              "Referrer ID",
              "Referrer Name",
              "Referred Client",
              "Referred Email",
              "Joined At",
              "Qualifying Allocation (NGN)",
              "Commission Rate (%)",
              "Commission Earned (NGN)",
              "Status",
              "Payout Transaction ID",
            ],
            rows: referrals.map((r) => [
              r.id,
              r.referrerId,
              r.referrerName,
              r.referredUserName,
              r.referredUserEmail,
              r.joinedAt,
              r.qualifyingInvestment,
              r.commissionRatePercent,
              r.commissionEarned,
              r.status,
              r.payoutTxnId ?? "",
            ]),
          },
          {
            title: "SECTION 2: COMPLIANCE AUDIT TRAIL",
            headers: [
              "Audit ID",
              "Timestamp",
              "Actor",
              "Role",
              "Action",
              "Target Type",
              "Target ID",
              "Summary",
              "Severity",
              "IP Address",
            ],
            rows: auditLogs.map((a) => [
              a.id,
              a.timestamp,
              a.actorName,
              a.actorRole,
              a.action,
              a.targetType,
              a.targetId,
              a.summary,
              a.severity,
              a.ipAddress,
            ]),
          },
        ]);
        triggerDownload(
          "silver-spoon-referrals-and-audit-report.csv",
          csvContent,
          "Referral Commission & Compliance Audit Export",
        );
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
              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={rep.onExport}
                  disabled={rep.recordCount === 0}
                  aria-label={`Download ${rep.title} CSV`}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download CSV
                </button>
                {rep.recordCount === 0 && (
                  <span className="text-xs text-muted-foreground">No records to export</span>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </AdminDashboardLayout>
  );
}

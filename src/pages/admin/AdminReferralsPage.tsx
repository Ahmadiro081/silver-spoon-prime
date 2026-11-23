import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { MetricCard, StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import { formatDate, formatNaira } from "@/utils/format";

export function AdminReferralsPage() {
  const { referrals, settings, adminMarkReferralPaid } = useAppState();

  const totalPaid = referrals
    .filter((r) => r.status === "Paid")
    .reduce((s, r) => s + r.commissionEarned, 0);
  const totalVolume = referrals.reduce((s, r) => s + r.qualifyingInvestment, 0);

  const settleCommission = (id: string, name: string) => {
    const res = adminMarkReferralPaid(id);
    if (res.ok) toast.success(`Settled referral commission for ${name}.`);
  };

  return (
    <AdminDashboardLayout title="Referral Management" breadcrumb="Referrals">
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-4">
          <MetricCard label="Total Referral Records" value={String(referrals.length)} />
          <MetricCard label="Qualifying Volume" value={formatNaira(totalVolume)} />
          <MetricCard label="Commissions Settled" value={formatNaira(totalPaid)} deltaTone="positive" />
          <MetricCard
            label="Platform Rate"
            value={`${settings.referralCommissionPercent.toFixed(1)}%`}
            detail="Configurable in Platform Settings"
          />
        </section>

        <div className="surface-card overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-lg font-medium text-foreground">
              Referral Commission Ledger
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">ID</th>
                  <th className="px-6 py-3 font-medium">Referrer</th>
                  <th className="px-6 py-3 font-medium">Invited Client</th>
                  <th className="px-6 py-3 font-medium">Joined</th>
                  <th className="px-6 py-3 text-right font-medium">Qualifying Allocation</th>
                  <th className="px-6 py-3 text-right font-medium">Commission</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {referrals.map((ref) => (
                  <tr key={ref.id} className="hover:bg-secondary/25">
                    <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">{ref.id}</td>
                    <td className="px-6 py-3.5 font-medium text-foreground">{ref.referrerName}</td>
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-foreground">{ref.referredUserName}</p>
                      <p className="text-xs text-muted-foreground">{ref.referredUserEmail}</p>
                    </td>
                    <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                      {formatDate(ref.joinedAt)}
                    </td>
                    <td className="font-tabular px-6 py-3.5 text-right text-foreground">
                      {formatNaira(ref.qualifyingInvestment)}
                    </td>
                    <td className="font-tabular px-6 py-3.5 text-right font-semibold text-success">
                      {formatNaira(ref.commissionEarned)}
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusText status={ref.status} />
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {ref.status !== "Paid" ? (
                        <button
                          type="button"
                          onClick={() => settleCommission(ref.id, ref.referrerName)}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Mark Paid
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Settled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminDashboardLayout>
  );
}

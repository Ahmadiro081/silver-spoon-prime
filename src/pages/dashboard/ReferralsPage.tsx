import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { MetricCard, StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import { formatDate, formatNaira } from "@/utils/format";

export function ReferralsPage() {
  const { currentUser, userReferrals, settings } = useAppState();
  const [copiedField, setCopiedField] = useState<"link" | "code" | null>(null);

  const investorCode = currentUser.role === "investor" ? currentUser.referralCode : "SS-ADAEZE24";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://silverspoon.ng";
  const referralLink = `${origin}/register?ref=${investorCode}`;

  const totalEarned = userReferrals.reduce((s, r) => s + r.commissionEarned, 0);
  const qualifiedCount = userReferrals.filter((r) => r.qualifyingInvestment > 0).length;
  const totalReferredVolume = userReferrals.reduce((s, r) => s + r.qualifyingInvestment, 0);

  const copyValue = async (text: string, kind: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(kind);
      toast.success(kind === "link" ? "Referral link copied to clipboard." : "Referral code copied.");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Unable to copy automatically. Select and copy manually.");
    }
  };

  return (
    <UserDashboardLayout title="Referral Program" breadcrumb="Referrals">
      <div className="space-y-6">
        {/* Referral Statistics */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Commission Earned"
            value={formatNaira(totalEarned)}
            detail="Credited to Naira wallet"
            deltaTone="positive"
          />
          <MetricCard
            label="Total Invited Clients"
            value={String(userReferrals.length)}
            detail={`${qualifiedCount} completed qualifying mandate`}
          />
          <MetricCard
            label="Referred Allocation Volume"
            value={formatNaira(totalReferredVolume)}
            detail="Qualifying first allocations"
          />
          <MetricCard
            label="Commission Rate"
            value={`${settings.referralCommissionPercent.toFixed(1)}%`}
            detail="Paid on qualifying first investment"
          />
        </section>

        {/* Unique Referral Link Card + Commission Overview */}
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="surface-card p-6 lg:col-span-7">
            <h2 className="font-display text-xl font-medium text-foreground">
              Your Unique Referral Link
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Share your private invitation link with colleagues or corporate treasury peers.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="ref-link" className="block text-xs font-medium text-muted-foreground">
                  Invitation URL
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="ref-link"
                    type="text"
                    readOnly
                    value={referralLink}
                    className="font-tabular h-10 flex-1 rounded-lg border border-input bg-secondary/40 px-3 text-xs text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => copyValue(referralLink, "link")}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground whitespace-nowrap hover:bg-primary/90"
                  >
                    {copiedField === "link" ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy Link
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="ref-code" className="block text-xs font-medium text-muted-foreground">
                  Referral Code
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="ref-code"
                    type="text"
                    readOnly
                    value={investorCode}
                    className="font-tabular h-10 w-52 rounded-lg border border-input bg-secondary/40 px-3 text-sm font-semibold text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => copyValue(investorCode, "code")}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-xs font-medium text-foreground whitespace-nowrap hover:bg-secondary"
                  >
                    {copiedField === "code" ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-success" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy Code
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="surface-card p-6 lg:col-span-5">
            <h2 className="font-display text-xl font-medium text-foreground">Commission Overview</h2>
            <ol className="mt-4 space-y-3 text-xs leading-relaxed text-muted-foreground">
              <li>
                <span className="font-semibold text-foreground">01. Share Invitation — </span>
                Your invitee registers via your personal link or enters code{" "}
                <span className="font-tabular text-foreground">{investorCode}</span>.
              </li>
              <li>
                <span className="font-semibold text-foreground">02. Qualifying Allocation — </span>
                Once they verify KYC and allocate into any active Naira mandate (min. ₦50,000), the
                referral qualifies.
              </li>
              <li>
                <span className="font-semibold text-foreground">03. Wallet Settlement — </span>
                A {settings.referralCommissionPercent}% commission is logged and settled into your
                Available Balance after compliance check.
              </li>
            </ol>
          </div>
        </section>

        {/* Referral History Table */}
        <section className="surface-card overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-lg font-medium text-foreground">Referral History</h2>
            <p className="text-xs text-muted-foreground">
              Invited accounts and commission payout status
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Invited Client</th>
                  <th className="px-6 py-3 font-medium">Joined</th>
                  <th className="px-6 py-3 text-right font-medium">Qualifying Allocation</th>
                  <th className="px-6 py-3 text-right font-medium">Commission Earned</th>
                  <th className="px-6 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {userReferrals.map((ref) => (
                  <tr key={ref.id} className="hover:bg-secondary/25">
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
                    <td className="px-6 py-3.5 text-right">
                      <StatusText status={ref.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </UserDashboardLayout>
  );
}

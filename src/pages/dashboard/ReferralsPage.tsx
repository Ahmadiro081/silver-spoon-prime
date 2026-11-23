import { useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import {
  MetricCard,
  SegmentedFilter,
  StatusText,
  TableEmptyRow,
} from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { ReferralRecord } from "@/types/domain";
import { formatDate, formatNaira } from "@/utils/format";

export function ReferralsPage() {
  const { currentUser, userReferrals, settings } = useAppState();
  const [copiedField, setCopiedField] = useState<"link" | "code" | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ReferralRecord["status"]>("ALL");

  const investorCode = currentUser.referralCode;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://silverspoon.ng";
  const referralLink = `${origin}/register?ref=${investorCode}`;

  const totalEarned = userReferrals.reduce((s, r) => s + r.commissionEarned, 0);
  const qualifiedCount = userReferrals.filter((r) => r.qualifyingInvestment > 0).length;
  const totalReferredVolume = userReferrals.reduce((s, r) => s + r.qualifyingInvestment, 0);

  const filteredReferrals = userReferrals.filter((ref) => {
    const matchesStatus = statusFilter === "ALL" || ref.status === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      ref.referredUserName.toLowerCase().includes(q) ||
      ref.referredUserEmail.toLowerCase().includes(q) ||
      ref.id.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

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
            deltaTone={totalEarned > 0 ? "positive" : "neutral"}
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
            detail="Paid automatically on first qualifying mandate"
          />
        </section>

        {/* Unique Referral Link Card + Commission Overview */}
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="surface-card p-6 lg:col-span-7">
            <h2 className="font-display text-xl font-medium text-foreground">
              Your Unique Referral Link
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Share your personal invitation link with colleagues or corporate treasury peers.
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
                When they subscribe to their first active Naira mandate (min. ₦50,000), the
                referral qualifies automatically once per referred client.
              </li>
              <li>
                <span className="font-semibold text-foreground">03. Instant Simulated Settlement — </span>
                A {settings.referralCommissionPercent}% simulated commission is credited to your
                Available Balance with a ledger transaction and notification.
              </li>
            </ol>
          </div>
        </section>

        {/* Referral History Table */}
        <section className="surface-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display text-lg font-medium text-foreground">Referral History</h2>
              <p className="text-xs text-muted-foreground">
                Invited accounts and commission payout status
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search invitee..."
                  className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <SegmentedFilter
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { label: "All", value: "ALL" },
                  { label: "Paid", value: "Paid" },
                  { label: "Active", value: "Active" },
                  { label: "Pending", value: "Pending" },
                ]}
              />
            </div>
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
                {filteredReferrals.length === 0 ? (
                  <TableEmptyRow
                    colSpan={5}
                    title={
                      userReferrals.length === 0
                        ? "No referred clients yet"
                        : "No referrals match your filters"
                    }
                    description={
                      userReferrals.length === 0
                        ? "Share your personal referral link above to invite investors and earn simulated referral commissions on their first qualifying mandate."
                        : "Clear your search or status filter to inspect all invited accounts."
                    }
                  />
                ) : (
                  filteredReferrals.map((ref) => (
                    <tr key={ref.id} className="hover:bg-secondary/25">
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-foreground">{ref.referredUserName}</p>
                        <p className="text-xs text-muted-foreground">{ref.referredUserEmail}</p>
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(ref.joinedAt)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right text-foreground whitespace-nowrap">
                        {formatNaira(ref.qualifyingInvestment)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-right font-semibold text-success whitespace-nowrap">
                        {formatNaira(ref.commissionEarned)}
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <StatusText status={ref.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </UserDashboardLayout>
  );
}

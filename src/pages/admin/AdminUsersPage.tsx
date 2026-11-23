import { useState, type FormEvent } from "react";
import { Building2, CheckCircle2, Eye, MailWarning, Receipt, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import {
  MetricCard,
  SegmentedFilter,
  StatusText,
  TableEmptyRow,
} from "@/components/common/Primitives";
import { SlideOverDrawer } from "@/components/common/Modal";
import { TransactionReceiptModal } from "@/components/common/TransactionReceiptModal";
import { useAppState } from "@/context/AppStateContext";
import type { AccountStatus, TransactionRecord, UserProfile } from "@/types/domain";
import { calculateUserWalletMetrics } from "@/utils/calculations";
import { formatDate, formatDateTime, formatNaira } from "@/utils/format";

export function AdminUsersPage() {
  const {
    users,
    transactions,
    investments,
    adminUpdateUserStatus,
    adminUpdateUserTier,
    adminReviewUserKyc,
  } = useAppState();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AccountStatus>("ALL");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedTxn, setSelectedTxn] = useState<TransactionRecord | null>(null);

  // KYC Drawer form state
  const [kycStatus, setKycStatus] = useState<AccountStatus>("Active");
  const [kycLevel, setKycLevel] = useState<UserProfile["kycLevel"]>("Tier 2");
  const [kycTier, setKycTier] = useState<UserProfile["tier"]>("Silver");
  const [kycNote, setKycNote] = useState("");

  const investors = users.filter((u) => u.role === "investor");

  const filtered = investors.filter((u) => {
    const matchesStatus = statusFilter === "ALL" || u.status === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const inspectedUser = selectedUserId
    ? investors.find((u) => u.id === selectedUserId) ?? null
    : null;

  const inspectedTxns = inspectedUser
    ? transactions.filter((t) => t.userId === inspectedUser.id)
    : [];
  const inspectedInvs = inspectedUser
    ? investments.filter((i) => i.userId === inspectedUser.id)
    : [];
  const inspectedWallet = inspectedUser
    ? calculateUserWalletMetrics(inspectedTxns, inspectedInvs)
    : null;

  const openUserDrawer = (user: UserProfile) => {
    setSelectedUserId(user.id);
    setKycStatus(user.status);
    setKycLevel(user.kycLevel);
    setKycTier(user.tier);
    setKycNote(user.kycNote ?? "");
  };

  const handleStatusChange = (user: UserProfile, next: AccountStatus) => {
    const res = adminUpdateUserStatus(user.id, next);
    if (res.ok) {
      toast.success(`${user.fullName} set to ${next}.`);
    } else {
      toast.error(res.error ?? "Unable to update status.");
    }
  };

  const handleTierChange = (user: UserProfile, tier: UserProfile["tier"]) => {
    const res = adminUpdateUserTier(user.id, tier);
    if (res.ok) {
      toast.success(`${user.fullName} moved to ${tier} tier.`);
    } else {
      toast.error(res.error ?? "Unable to update client tier.");
    }
  };

  const handleSaveKycReview = (e: FormEvent) => {
    e.preventDefault();
    if (!inspectedUser) return;

    const kycRes = adminReviewUserKyc(inspectedUser.id, {
      status: kycStatus,
      kycLevel,
      note: kycNote.trim() || undefined,
    });
    if (!kycRes.ok) {
      toast.error(kycRes.error ?? "Unable to save KYC review.");
      return;
    }

    if (kycTier !== inspectedUser.tier) {
      adminUpdateUserTier(inspectedUser.id, kycTier);
    }

    toast.success(`Compliance & KYC review saved for ${inspectedUser.fullName}.`);
  };

  const handleQuickApproveKyc = () => {
    if (!inspectedUser) return;
    const nextLevel: UserProfile["kycLevel"] =
      inspectedUser.kycLevel === "Tier 1" ? "Tier 2" : inspectedUser.kycLevel;
    const note = kycNote.trim() || "Identity and BVN documentation approved by compliance desk.";
    const res = adminReviewUserKyc(inspectedUser.id, {
      status: "Active",
      kycLevel: nextLevel,
      note,
    });
    if (res.ok) {
      setKycStatus("Active");
      setKycLevel(nextLevel);
      setKycNote(note);
      toast.success(`Approved ${inspectedUser.fullName} (${nextLevel}, Active).`);
    } else {
      toast.error(res.error ?? "Unable to approve KYC.");
    }
  };

  return (
    <AdminDashboardLayout title="User Management" breadcrumb="Users">
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Total Client Accounts" value={String(investors.length)} />
          <MetricCard
            label="Active Verified Clients"
            value={String(investors.filter((u) => u.status === "Active").length)}
          />
          <MetricCard
            label="Pending KYC / Suspended"
            value={String(investors.filter((u) => u.status !== "Active").length)}
          />
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, or user ID..."
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <SegmentedFilter
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: "All", value: "ALL" },
              { label: "Active", value: "Active" },
              { label: "Pending KYC", value: "Pending KYC" },
              { label: "Suspended", value: "Suspended" },
            ]}
          />
        </div>

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Tier & KYC</th>
                  <th className="px-6 py-3 text-right font-medium">Total Balance</th>
                  <th className="px-6 py-3 text-right font-medium">Active Invested</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={6}
                    title="No client accounts match your criteria"
                    description="Adjust the status filter or search keyword to inspect investor profiles."
                  />
                ) : (
                  filtered.map((user) => {
                    const uTxns = transactions.filter((t) => t.userId === user.id);
                    const uInvs = investments.filter((i) => i.userId === user.id);
                    const wallet = calculateUserWalletMetrics(uTxns, uInvs);
                    return (
                      <tr key={user.id} className="hover:bg-secondary/25">
                        <td className="px-6 py-3.5">
                          <button
                            type="button"
                            onClick={() => openUserDrawer(user)}
                            className="text-left hover:underline"
                          >
                            <p className="font-medium text-foreground">{user.fullName}</p>
                            <p className="text-xs text-muted-foreground">
                              {user.email} · <span className="font-tabular">{user.id}</span>
                            </p>
                          </button>
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2">
                            <select
                              aria-label={`Tier for ${user.fullName}`}
                              value={user.tier}
                              onChange={(e) =>
                                handleTierChange(user, e.target.value as UserProfile["tier"])
                              }
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground"
                            >
                              <option value="Silver">Silver</option>
                              <option value="Platinum">Platinum</option>
                              <option value="Sovereign">Sovereign</option>
                            </select>
                            <span className="text-xs text-muted-foreground">{user.kycLevel}</span>
                          </div>
                        </td>
                        <td className="font-tabular px-6 py-3.5 text-right font-semibold text-foreground whitespace-nowrap">
                          {formatNaira(wallet.totalWalletBalance)}
                        </td>
                        <td className="font-tabular px-6 py-3.5 text-right text-muted-foreground whitespace-nowrap">
                          {formatNaira(wallet.activeInvestments)}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap">
                          <StatusText status={user.status} />
                          <p className="font-tabular text-[11px] text-muted-foreground">
                            Joined {formatDate(user.joinedAt)}
                          </p>
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openUserDrawer(user)}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Inspect
                            </button>
                            {user.status === "Active" ? (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(user, "Suspended")}
                                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(user, "Active")}
                                className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                              >
                                Activate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* User Details & KYC Review Slide-Over Drawer */}
      <SlideOverDrawer
        open={Boolean(inspectedUser)}
        onClose={() => setSelectedUserId(null)}
        title={inspectedUser?.fullName ?? "Client Profile"}
        subtitle={
          inspectedUser ? `${inspectedUser.id} · ${inspectedUser.email}` : undefined
        }
        widthClass="max-w-2xl"
      >
        {inspectedUser && inspectedWallet && (
          <div className="space-y-6">
            {/* Identity & Settlement Account Summary */}
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-secondary/30 p-4 text-xs">
                <p className="font-semibold text-foreground">Client Profile</p>
                <dl className="mt-3 space-y-2">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Email Status</dt>
                    <dd>
                      {inspectedUser.emailVerified ? (
                        <span className="inline-flex items-center gap-1 font-medium text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-warning">
                          <MailWarning className="h-3.5 w-3.5" /> Unverified
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-tabular text-foreground">{inspectedUser.phone || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Location</dt>
                    <dd className="text-right text-foreground">{inspectedUser.city || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Referral Code</dt>
                    <dd className="font-tabular font-medium text-foreground">
                      {inspectedUser.referralCode}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-border bg-secondary/30 p-4 text-xs">
                <p className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Settlement Bank Account
                </p>
                {inspectedUser.bankAccount.accountNumber ? (
                  <dl className="mt-3 space-y-2">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Bank</dt>
                      <dd className="font-medium text-foreground">
                        {inspectedUser.bankAccount.bankName}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Account Name</dt>
                      <dd className="text-right text-foreground">
                        {inspectedUser.bankAccount.accountName}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">NUBAN</dt>
                      <dd className="font-tabular font-medium text-foreground">
                        {inspectedUser.bankAccount.accountNumber}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-muted-foreground">
                    No Nigerian settlement bank account configured yet.
                  </p>
                )}
              </div>
            </section>

            {/* Wallet Breakdown */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Wallet Breakdown (NGN)
              </h4>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] text-muted-foreground">Total Balance</p>
                  <p className="font-tabular mt-1 text-sm font-semibold text-foreground">
                    {formatNaira(inspectedWallet.totalWalletBalance)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] text-muted-foreground">Available Cash</p>
                  <p className="font-tabular mt-1 text-sm font-semibold text-foreground">
                    {formatNaira(inspectedWallet.availableBalance)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] text-muted-foreground">Active Mandates</p>
                  <p className="font-tabular mt-1 text-sm font-semibold text-foreground">
                    {formatNaira(inspectedWallet.activeInvestments)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] text-muted-foreground">Pending Payouts</p>
                  <p className="font-tabular mt-1 text-sm font-semibold text-warning">
                    {formatNaira(inspectedWallet.pendingWithdrawals)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] text-muted-foreground">Total Deposits</p>
                  <p className="font-tabular mt-1 text-xs font-medium text-foreground">
                    {formatNaira(inspectedWallet.totalDeposits)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] text-muted-foreground">Total Withdrawals</p>
                  <p className="font-tabular mt-1 text-xs font-medium text-foreground">
                    {formatNaira(inspectedWallet.totalWithdrawals)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] text-muted-foreground">Realized Earnings</p>
                  <p className="font-tabular mt-1 text-xs font-medium text-success">
                    {formatNaira(inspectedWallet.realizedEarnings)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] text-muted-foreground">Referral Earnings</p>
                  <p className="font-tabular mt-1 text-xs font-medium text-success">
                    {formatNaira(inspectedWallet.referralEarnings)}
                  </p>
                </div>
              </div>
            </section>

            {/* KYC Review & Tier Governance */}
            <section className="rounded-xl border border-border bg-secondary/25 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  KYC Verification & Tier Management
                </h4>
                {inspectedUser.status !== "Active" && (
                  <button
                    type="button"
                    onClick={handleQuickApproveKyc}
                    className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Quick Approve KYC
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveKycReview} className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="kyc-status" className="block text-xs font-medium text-foreground">
                      Account Status
                    </label>
                    <select
                      id="kyc-status"
                      value={kycStatus}
                      onChange={(e) => setKycStatus(e.target.value as AccountStatus)}
                      className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground"
                    >
                      <option value="Active">Active</option>
                      <option value="Pending KYC">Pending KYC</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="kyc-level" className="block text-xs font-medium text-foreground">
                      KYC Level
                    </label>
                    <select
                      id="kyc-level"
                      value={kycLevel}
                      onChange={(e) => setKycLevel(e.target.value as UserProfile["kycLevel"])}
                      className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground"
                    >
                      <option value="Tier 1">Tier 1 (Unverified)</option>
                      <option value="Tier 2">Tier 2 (BVN Verified)</option>
                      <option value="Tier 3">Tier 3 (Full Institutional)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="kyc-tier" className="block text-xs font-medium text-foreground">
                      Client Tier
                    </label>
                    <select
                      id="kyc-tier"
                      value={kycTier}
                      onChange={(e) => setKycTier(e.target.value as UserProfile["tier"])}
                      className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground"
                    >
                      <option value="Silver">Silver</option>
                      <option value="Platinum">Platinum</option>
                      <option value="Sovereign">Sovereign</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="kyc-note" className="block text-xs font-medium text-foreground">
                    Compliance / KYC Review Note
                  </label>
                  <textarea
                    id="kyc-note"
                    rows={2}
                    value={kycNote}
                    onChange={(e) => setKycNote(e.target.value)}
                    placeholder="Record verification remarks or reason for hold/suspension..."
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="font-tabular text-[11px] text-muted-foreground">
                    {inspectedUser.kycUpdatedAt
                      ? `Last reviewed ${formatDateTime(inspectedUser.kycUpdatedAt)}`
                      : "No prior review timestamp"}
                  </span>
                  <button
                    type="submit"
                    className="h-9 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Save Compliance Review
                  </button>
                </div>
              </form>
            </section>

            {/* User Investment History */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Investment Mandates ({inspectedInvs.length})
              </h4>
              <div className="mt-2.5 overflow-hidden rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-secondary/40 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Mandate</th>
                      <th className="px-4 py-2.5 text-right font-medium">Principal</th>
                      <th className="px-4 py-2.5 text-right font-medium">Maturity</th>
                      <th className="px-4 py-2.5 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inspectedInvs.length === 0 ? (
                      <TableEmptyRow
                        colSpan={4}
                        title="No investments yet"
                        description="This client has not allocated capital to any mandate."
                      />
                    ) : (
                      inspectedInvs.map((inv) => (
                        <tr key={inv.id}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-foreground">{inv.planName}</p>
                            <p className="font-tabular text-[11px] text-muted-foreground">
                              {inv.id} · {inv.targetReturnPercent}% target
                            </p>
                          </td>
                          <td className="font-tabular px-4 py-2.5 text-right font-semibold text-foreground">
                            {formatNaira(inv.principal)}
                          </td>
                          <td className="font-tabular px-4 py-2.5 text-right text-muted-foreground">
                            {formatDate(inv.maturesAt)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <StatusText status={inv.status} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* User Transaction History */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Ledger Transactions ({inspectedTxns.length})
              </h4>
              <div className="mt-2.5 overflow-hidden rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-secondary/40 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Type & Reference</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                      <th className="px-4 py-2.5 text-right font-medium">Status</th>
                      <th className="px-4 py-2.5 text-right font-medium">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inspectedTxns.length === 0 ? (
                      <TableEmptyRow
                        colSpan={4}
                        title="No transactions recorded"
                        description="This client currently has an empty Naira ledger."
                      />
                    ) : (
                      inspectedTxns.slice(0, 10).map((txn) => (
                        <tr key={txn.id} className="hover:bg-secondary/25">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-foreground">{txn.type}</p>
                            <p className="font-tabular text-[11px] text-muted-foreground">
                              {txn.reference}
                            </p>
                          </td>
                          <td className="font-tabular px-4 py-2.5 text-right font-semibold text-foreground">
                            {formatNaira(txn.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <StatusText status={txn.status} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedTxn(txn)}
                              aria-label={`View receipt ${txn.reference}`}
                              className="inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11px] font-medium text-foreground hover:bg-secondary"
                            >
                              <Receipt className="h-3 w-3" />
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </SlideOverDrawer>

      <TransactionReceiptModal transaction={selectedTxn} onClose={() => setSelectedTxn(null)} />
    </AdminDashboardLayout>
  );
}

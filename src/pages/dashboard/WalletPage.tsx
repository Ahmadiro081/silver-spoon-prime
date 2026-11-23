import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { MetricCard, RiskDisclosure, SegmentedFilter, StatusText } from "@/components/common/Primitives";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";
import { NIGERIAN_BANKS } from "@/data/mockDatabase";
import { formatDateTime, formatNaira, maskAccountNumber } from "@/utils/format";

const DEPOSIT_PRESETS = [50_000, 150_000, 500_000, 1_500_000];
const CHANNELS = ["NIP Bank Transfer", "Corporate Wire Transfer", "Nigerian Debit Card", "USSD Transfer"];

export function WalletPage() {
  const {
    currentUser,
    userWallet,
    userTransactions,
    settings,
    createDeposit,
    requestWithdrawal,
    updateBankAccount,
  } = useAppState();

  const [mode, setMode] = useState<"deposit" | "withdraw" | "bank">("deposit");
  const [historyTab, setHistoryTab] = useState<"all" | "deposits" | "withdrawals">("all");

  // Deposit form state
  const [depAmount, setDepAmount] = useState("200000");
  const [depChannel, setDepChannel] = useState(CHANNELS[0]!);
  const [depNote, setDepNote] = useState("");

  // Withdrawal form state
  const [wdrAmount, setWdrAmount] = useState("100000");
  const [wdrNote, setWdrNote] = useState("");

  // Bank details form state
  const [bankCode, setBankCode] = useState(currentUser.bankAccount.bankCode || "058");
  const [accountNumber, setAccountNumber] = useState(currentUser.bankAccount.accountNumber || "");
  const [accountName, setAccountName] = useState(currentUser.bankAccount.accountName || currentUser.fullName.toUpperCase());

  const handleDeposit = (e: FormEvent) => {
    e.preventDefault();
    const res = createDeposit({
      amount: Number(depAmount),
      channel: depChannel,
      note: depNote,
    });
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Deposit could not be processed.");
      return;
    }
    toast.success(
      res.data.status === "Completed"
        ? `Simulated deposit of ${formatNaira(res.data.amount)} credited instantly.`
        : `Simulated deposit of ${formatNaira(res.data.amount)} queued for Admin confirmation.`,
    );
    setDepNote("");
  };

  const handleWithdraw = (e: FormEvent) => {
    e.preventDefault();
    const res = requestWithdrawal({
      amount: Number(wdrAmount),
      note: wdrNote,
    });
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Withdrawal request failed.");
      return;
    }
    toast.success(
      `Withdrawal request (${res.data.reference}) for ${formatNaira(res.data.amount)} submitted for treasury approval.`,
    );
    setWdrNote("");
  };

  const handleBankSave = (e: FormEvent) => {
    e.preventDefault();
    const bank = NIGERIAN_BANKS.find((b) => b.code === bankCode);
    if (!bank) return;
    const res = updateBankAccount({
      bankCode: bank.code,
      bankName: bank.name,
      accountNumber: accountNumber.trim(),
      accountName: accountName.trim().toUpperCase(),
      verified: true,
    });
    if (!res.ok) {
      toast.error(res.error ?? "Could not save bank details.");
      return;
    }
    toast.success("Nigerian payout bank account verified and saved.");
  };

  const historyRows = userTransactions.filter((t) => {
    if (historyTab === "deposits") return t.type === "Deposit";
    if (historyTab === "withdrawals") return t.type === "Withdrawal";
    return true;
  });

  const withdrawalNum = Number(wdrAmount) || 0;
  const estimatedFee =
    withdrawalNum >= settings.withdrawalFeeThreshold ? settings.highValueWithdrawalFee : 0;

  return (
    <UserDashboardLayout title="Wallet Management" breadcrumb="Wallet">
      <div className="space-y-6">
        {/* Wallet KPIs */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total Wallet Balance"
            value={formatNaira(userWallet.totalWalletBalance)}
            detail="Combined Naira liquidity & mandates"
          />
          <MetricCard
            label="Available Balance"
            value={formatNaira(userWallet.availableBalance)}
            detail="Withdrawable or ready to invest"
            deltaTone="positive"
          />
          <MetricCard
            label="Pending Withdrawals"
            value={formatNaira(userWallet.pendingWithdrawals)}
            detail="Reserved pending treasury approval"
          />
          <MetricCard
            label="Net Lifetime Deposits"
            value={formatNaira(userWallet.totalDeposits)}
            detail={`Withdrawals: ${formatNaira(userWallet.totalWithdrawals)}`}
          />
        </section>

        {/* Action Workbench + Destination Bank Summary */}
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="surface-card p-6 lg:col-span-7">
            <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
              <h2 className="font-display text-xl font-medium text-foreground">
                Simulated Wallet Operations
              </h2>
              <SegmentedFilter
                value={mode}
                onChange={setMode}
                options={[
                  { label: "Deposit", value: "deposit" },
                  { label: "Withdraw", value: "withdraw" },
                  { label: "Bank Account", value: "bank" },
                ]}
              />
            </div>

            {mode === "deposit" && (
              <form onSubmit={handleDeposit} className="mt-5 space-y-5">
                <div>
                  <label htmlFor="dep-amt" className="block text-xs font-medium text-foreground">
                    Deposit Amount (₦)
                  </label>
                  <input
                    id="dep-amt"
                    type="number"
                    min={settings.minDepositAmount}
                    step={5000}
                    value={depAmount}
                    onChange={(e) => setDepAmount(e.target.value)}
                    className="font-tabular mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3.5 text-base font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {DEPOSIT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDepAmount(String(preset))}
                        className="font-tabular rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary"
                      >
                        {formatNaira(preset)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="dep-chan" className="block text-xs font-medium text-foreground">
                    Simulated Funding Channel
                  </label>
                  <select
                    id="dep-chan"
                    value={depChannel}
                    onChange={(e) => setDepChannel(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="dep-note" className="block text-xs font-medium text-foreground">
                    Narration / Reference Note (optional)
                  </label>
                  <input
                    id="dep-note"
                    type="text"
                    value={depNote}
                    onChange={(e) => setDepNote(e.target.value)}
                    placeholder="e.g. November treasury allocation"
                    className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Simulated deposits up to{" "}
                  <span className="font-tabular font-medium text-foreground">
                    {formatNaira(settings.autoApproveDepositsUnder)}
                  </span>{" "}
                  credit immediately; larger deposits queue for confirmation in the Admin Console.
                </p>

                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Simulate Deposit of {formatNaira(Number(depAmount) || 0)}
                </button>
              </form>
            )}

            {mode === "withdraw" && (
              <form onSubmit={handleWithdraw} className="mt-5 space-y-5">
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="wdr-amt" className="font-medium text-foreground">
                      Withdrawal Amount (₦)
                    </label>
                    <span className="font-tabular text-muted-foreground">
                      Available: {formatNaira(userWallet.availableBalance)}
                    </span>
                  </div>
                  <input
                    id="wdr-amt"
                    type="number"
                    min={5000}
                    max={userWallet.availableBalance}
                    step={5000}
                    value={wdrAmount}
                    onChange={(e) => setWdrAmount(e.target.value)}
                    className="font-tabular mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3.5 text-base font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="rounded-lg border border-border bg-secondary/40 p-4 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Destination Bank</span>
                    <span className="font-medium text-foreground">
                      {currentUser.bankAccount.bankName}{" "}
                      {maskAccountNumber(currentUser.bankAccount.accountNumber)}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span className="text-muted-foreground">Settlement Fee</span>
                    <span className="font-tabular font-medium text-foreground">
                      {estimatedFee > 0 ? formatNaira(estimatedFee) : "₦0 (Waived)"}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-border pt-2">
                    <span className="font-medium text-foreground">Total Debit</span>
                    <span className="font-tabular font-semibold text-foreground">
                      {formatNaira(withdrawalNum + estimatedFee)}
                    </span>
                  </div>
                </div>

                <div>
                  <label htmlFor="wdr-note" className="block text-xs font-medium text-foreground">
                    Payout Memo (optional)
                  </label>
                  <input
                    id="wdr-note"
                    type="text"
                    value={wdrNote}
                    onChange={(e) => setWdrNote(e.target.value)}
                    placeholder="e.g. Monthly liquidity draw"
                    className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Request Simulated Withdrawal
                </button>
              </form>
            )}

            {mode === "bank" && (
              <form onSubmit={handleBankSave} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="bank-select" className="block text-xs font-medium text-foreground">
                    Nigerian Bank
                  </label>
                  <select
                    id="bank-select"
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {NIGERIAN_BANKS.map((bank) => (
                      <option key={bank.code} value={bank.code}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="bank-num" className="block text-xs font-medium text-foreground">
                      10-Digit NUBAN Account Number
                    </label>
                    <input
                      id="bank-num"
                      type="text"
                      maxLength={10}
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                      placeholder="0123456789"
                      className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label htmlFor="bank-holder" className="block text-xs font-medium text-foreground">
                      Account Holder Name
                    </label>
                    <input
                      id="bank-holder"
                      type="text"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Save & Verify Bank Account
                </button>
              </form>
            )}
          </div>

          <div className="surface-card flex flex-col justify-between p-6 lg:col-span-5">
            <div>
              <h2 className="font-display text-xl font-medium text-foreground">
                Verified Settlement Account
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                All Naira withdrawals settle exclusively to your verified NUBAN account.
              </p>

              <dl className="mt-6 space-y-3 border-y border-border py-5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Bank</dt>
                  <dd className="text-right font-medium text-foreground">
                    {currentUser.bankAccount.bankName}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">NUBAN</dt>
                  <dd className="font-tabular font-medium text-foreground">
                    {currentUser.bankAccount.accountNumber || "Not set"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Account Name</dt>
                  <dd className="text-right font-medium text-foreground">
                    {currentUser.bankAccount.accountName}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Verification</dt>
                  <dd>
                    <StatusText
                      status={currentUser.bankAccount.verified ? "Verified" : "Pending"}
                      showIcon
                    />
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-5">
              <RiskDisclosure
                title="Simulated Transactions Only"
                text={APP_CONFIG.disclosures.simulationNotice}
              />
            </div>
          </div>
        </section>

        {/* Deposit / Withdrawal / Full History */}
        <section className="surface-card overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-lg font-medium text-foreground">Wallet History</h2>
              <p className="text-xs text-muted-foreground">
                Inspect deposits, withdrawal requests, and complete ledger settlements
              </p>
            </div>
            <SegmentedFilter
              value={historyTab}
              onChange={setHistoryTab}
              options={[
                { label: "All Activity", value: "all" },
                { label: "Deposit History", value: "deposits" },
                { label: "Withdrawal History", value: "withdrawals" },
              ]}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Reference</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Channel & Note</th>
                  <th className="px-6 py-3 font-medium">Timestamp</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {historyRows.map((txn) => (
                  <tr key={txn.id} className="hover:bg-secondary/25">
                    <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                      {txn.reference}
                    </td>
                    <td className="px-6 py-3.5 font-medium text-foreground">{txn.type}</td>
                    <td className="px-6 py-3.5">
                      <p className="text-xs font-medium text-foreground">{txn.channel}</p>
                      {txn.note && <p className="text-[11px] text-muted-foreground">{txn.note}</p>}
                    </td>
                    <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                      {formatDateTime(txn.createdAt)}
                    </td>
                    <td className="font-tabular px-6 py-3.5 text-right font-semibold text-foreground">
                      {formatNaira(txn.amount)}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <StatusText status={txn.status} />
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

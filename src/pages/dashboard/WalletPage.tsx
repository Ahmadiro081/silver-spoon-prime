import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Receipt, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import {
  FormAlert,
  MetricCard,
  RiskDisclosure,
  SegmentedFilter,
  StatusText,
  TableEmptyRow,
} from "@/components/common/Primitives";
import { Modal } from "@/components/common/Modal";
import { TransactionReceiptModal } from "@/components/common/TransactionReceiptModal";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";
import { NIGERIAN_BANKS } from "@/data/nigerianBanks";
import { calculateDailyWithdrawalTotal, validateWithdrawal } from "@/services/platformService";
import type { TransactionRecord } from "@/types/domain";
import { getTransactionLedgerImpact } from "@/utils/calculations";
import { formatDateTime, formatNaira, maskAccountNumber } from "@/utils/format";

const DEPOSIT_PRESETS = [50_000, 150_000, 500_000, 1_500_000];
const CHANNELS = [
  "NIP Bank Transfer",
  "Corporate Wire Transfer",
  "Nigerian Debit Card",
  "USSD Transfer",
];

export function WalletPage() {
  const {
    currentUser,
    resetVersion,
    userWallet,
    userTransactions,
    settings,
    pendingTwoFactorCode,
    createDeposit,
    requestWithdrawal,
    requestTwoFactorChallenge,
    updateBankAccount,
  } = useAppState();

  const [mode, setMode] = useState<"deposit" | "withdraw" | "bank">("deposit");
  const [historyTab, setHistoryTab] = useState<"all" | "deposits" | "withdrawals">("all");
  const [selectedTxn, setSelectedTxn] = useState<TransactionRecord | null>(null);

  // Deposit form state
  const [depAmount, setDepAmount] = useState("200000");
  const [depChannel, setDepChannel] = useState(CHANNELS[0]!);
  const [depNote, setDepNote] = useState("");
  const [depError, setDepError] = useState<string | null>(null);
  const [depSubmitting, setDepSubmitting] = useState(false);

  // Withdrawal form state
  const [wdrAmount, setWdrAmount] = useState("100000");
  const [wdrNote, setWdrNote] = useState("");
  const [wdrError, setWdrError] = useState<string | null>(null);
  const [wdrSubmitting, setWdrSubmitting] = useState(false);

  // Simulated 2FA withdrawal modal state
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);
  const [twoFactorInput, setTwoFactorInput] = useState("");
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);

  // Bank details form state (synced on account switch & demo reset)
  const [bankCode, setBankCode] = useState(currentUser.bankAccount.bankCode || "058");
  const [accountNumber, setAccountNumber] = useState(currentUser.bankAccount.accountNumber || "");
  const [accountName, setAccountName] = useState(
    currentUser.bankAccount.accountName || currentUser.fullName.toUpperCase(),
  );
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankSubmitting, setBankSubmitting] = useState(false);

  useEffect(() => {
    setBankCode(currentUser.bankAccount.bankCode || "058");
    setAccountNumber(currentUser.bankAccount.accountNumber || "");
    setAccountName(currentUser.bankAccount.accountName || currentUser.fullName.toUpperCase());
    setDepError(null);
    setWdrError(null);
    setBankError(null);
    setTwoFactorModalOpen(false);
    setTwoFactorInput("");
    setTwoFactorError(null);
    setSelectedTxn(null);
  }, [
    currentUser.id,
    currentUser.fullName,
    currentUser.bankAccount.bankCode,
    currentUser.bankAccount.accountNumber,
    currentUser.bankAccount.accountName,
    resetVersion,
  ]);

  const isSuspended = currentUser.status === "Suspended";
  const kycBlocksWithdrawal =
    settings.requireKycForWithdrawals &&
    (currentUser.kycLevel === "Tier 1" || currentUser.status === "Pending KYC");
  const bankStatus =
    currentUser.bankAccount.verificationStatus ??
    (!currentUser.bankAccount.accountNumber
      ? "Unverified"
      : currentUser.bankAccount.verified
        ? "Simulated Verified"
        : "Pending Verification");

  const usedDailyWithdrawal = calculateDailyWithdrawalTotal(userTransactions, currentUser.id);
  const remainingDailyWithdrawal = Math.max(0, settings.maxDailyWithdrawal - usedDailyWithdrawal);

  const handleDeposit = (e: FormEvent) => {
    e.preventDefault();
    setDepError(null);
    setDepSubmitting(true);
    const res = createDeposit({
      amount: Number(depAmount),
      channel: depChannel,
      note: depNote,
    });
    setDepSubmitting(false);
    if (!res.ok || !res.data) {
      const msg = res.error ?? "Deposit could not be processed.";
      setDepError(msg);
      toast.error(msg);
      return;
    }
    toast.success(
      res.data.status === "Completed"
        ? `Simulated deposit of ${formatNaira(res.data.amount)} credited instantly.`
        : `Simulated deposit of ${formatNaira(res.data.amount)} queued for Admin confirmation.`,
    );
    setDepNote("");
  };

  const executeWithdrawal = (twoFactorCode?: string) => {
    setWdrSubmitting(true);
    const res = requestWithdrawal({
      amount: Number(wdrAmount),
      note: wdrNote,
      twoFactorCode,
    });
    setWdrSubmitting(false);
    if (!res.ok || !res.data) {
      const msg = res.error ?? "Withdrawal request failed.";
      if (twoFactorModalOpen) {
        setTwoFactorError(msg);
      } else {
        setWdrError(msg);
      }
      toast.error(msg);
      return;
    }
    setTwoFactorModalOpen(false);
    setTwoFactorInput("");
    setTwoFactorError(null);
    setWdrError(null);
    toast.success(
      `Withdrawal request (${res.data.reference}) for ${formatNaira(res.data.amount)} submitted for treasury approval.`,
    );
    setWdrNote("");
  };

  const handleWithdraw = (e: FormEvent) => {
    e.preventDefault();
    setWdrError(null);

    const parsedAmount = Number(wdrAmount);
    const precheck = validateWithdrawal(
      { amount: parsedAmount, note: wdrNote },
      userWallet.availableBalance,
      currentUser,
      settings,
      userTransactions,
    );
    if (!precheck.ok) {
      const msg = precheck.error ?? "Withdrawal request could not be validated.";
      setWdrError(msg);
      toast.error(msg);
      return;
    }

    if (currentUser.twoFactorEnabled) {
      const challenge = requestTwoFactorChallenge("withdrawal disbursement");
      if (!challenge.ok) {
        const msg = challenge.error ?? "Unable to issue simulated 2FA code.";
        setWdrError(msg);
        toast.error(msg);
        return;
      }
      setTwoFactorInput("");
      setTwoFactorError(null);
      setTwoFactorModalOpen(true);
      return;
    }

    executeWithdrawal();
  };

  const handleConfirmTwoFactorWithdrawal = (e: FormEvent) => {
    e.preventDefault();
    setTwoFactorError(null);
    executeWithdrawal(twoFactorInput);
  };

  const handleRegenerateTwoFactorCode = () => {
    const res = requestTwoFactorChallenge("withdrawal disbursement");
    if (!res.ok) {
      toast.error(res.error ?? "Unable to issue a new confirmation code.");
      return;
    }
    setTwoFactorInput("");
    setTwoFactorError(null);
    toast.success("Issued a fresh simulated 6-digit confirmation code.");
  };

  const handleBankSave = (e: FormEvent) => {
    e.preventDefault();
    setBankError(null);
    const bank = NIGERIAN_BANKS.find((b) => b.code === bankCode);
    if (!bank) {
      setBankError("Select a valid Nigerian settlement bank.");
      return;
    }
    setBankSubmitting(true);
    const res = updateBankAccount({
      bankCode: bank.code,
      bankName: bank.name,
      accountNumber: accountNumber.trim(),
      accountName: accountName.trim().toUpperCase(),
      verified: false,
      verificationStatus: "Pending Verification",
    });
    setBankSubmitting(false);
    if (!res.ok) {
      const msg = res.error ?? "Could not save bank details.";
      setBankError(msg);
      toast.error(msg);
      return;
    }
    toast.success(
      "Settlement bank account saved (format validated locally; live NIBSS verification pending backend integration).",
    );
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
        {isSuspended && (
          <FormAlert>
            This account is currently suspended. Deposits, withdrawals, and bank account changes
            are disabled until compliance restores active standing.
          </FormAlert>
        )}

        {/* Wallet KPIs */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total Wallet Balance"
            value={formatNaira(userWallet.totalWalletBalance)}
            detail="Available cash + active mandates"
          />
          <MetricCard
            label="Available Balance"
            value={formatNaira(userWallet.availableBalance)}
            detail="Withdrawable or ready to allocate"
            deltaTone="positive"
          />
          <MetricCard
            label="Pending Withdrawals"
            value={formatNaira(userWallet.pendingWithdrawals)}
            detail="Reserved (incl. fees) pending approval"
          />
          <MetricCard
            label="Completed Deposits"
            value={formatNaira(userWallet.totalDeposits)}
            detail={`Settled withdrawals (incl. fees): ${formatNaira(userWallet.totalWithdrawals)}`}
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
                ariaLabel="Select wallet operation"
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setDepError(null);
                  setWdrError(null);
                  setBankError(null);
                }}
                options={[
                  { label: "Deposit", value: "deposit" },
                  { label: "Withdraw", value: "withdraw" },
                  { label: "Bank Account", value: "bank" },
                ]}
              />
            </div>

            {mode === "deposit" && (
              <form onSubmit={handleDeposit} className="mt-5 space-y-5" noValidate>
                {depError && <FormAlert>{depError}</FormAlert>}

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
                    onChange={(e) => {
                      setDepAmount(e.target.value);
                      if (depError) setDepError(null);
                    }}
                    className="font-tabular mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3.5 text-base font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {DEPOSIT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setDepAmount(String(preset));
                          if (depError) setDepError(null);
                        }}
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
                  Minimum deposit: <span className="font-tabular font-medium text-foreground">{formatNaira(settings.minDepositAmount)}</span>.
                </p>

                <button
                  type="submit"
                  disabled={depSubmitting || isSuspended}
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {depSubmitting
                    ? "Recording Deposit..."
                    : `Simulate Deposit of ${formatNaira(Number(depAmount) || 0)}`}
                </button>
              </form>
            )}

            {mode === "withdraw" && (
              <form onSubmit={handleWithdraw} className="mt-5 space-y-5" noValidate>
                {wdrError && <FormAlert>{wdrError}</FormAlert>}

                {kycBlocksWithdrawal && (
                  <div className="flex flex-col justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3.5 py-3 text-xs sm:flex-row sm:items-center">
                    <span className="text-foreground">
                      Withdrawals require{" "}
                      <span className="font-semibold">Tier 2 or Tier 3 KYC</span> approval. Current
                      status: {currentUser.kycLevel} · {currentUser.status}.
                    </span>
                    <Link
                      to="/dashboard/profile#kyc"
                      className="shrink-0 font-semibold text-foreground underline underline-offset-4 hover:text-primary"
                    >
                      Submit KYC
                    </Link>
                  </div>
                )}

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
                    max={Math.min(userWallet.availableBalance, remainingDailyWithdrawal) || undefined}
                    step={5000}
                    value={wdrAmount}
                    onChange={(e) => {
                      setWdrAmount(e.target.value);
                      if (wdrError) setWdrError(null);
                    }}
                    className="font-tabular mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3.5 text-base font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-4 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Destination Bank</span>
                    <span className="text-right font-medium text-foreground">
                      {currentUser.bankAccount.accountNumber
                        ? `${currentUser.bankAccount.bankName} ${maskAccountNumber(currentUser.bankAccount.accountNumber)}`
                        : "No payout bank configured"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Daily Withdrawal Limit</span>
                    <span className="font-tabular font-medium text-foreground">
                      {formatNaira(settings.maxDailyWithdrawal)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Used Today (Completed + Pending)</span>
                    <span className="font-tabular text-foreground">
                      {formatNaira(usedDailyWithdrawal)} · Remaining:{" "}
                      <span className="font-semibold">{formatNaira(remainingDailyWithdrawal)}</span>
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Settlement Fee</span>
                    <span className="font-tabular font-medium text-foreground">
                      {estimatedFee > 0 ? formatNaira(estimatedFee) : "₦0 (Waived)"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">2FA Confirmation</span>
                    <span className="font-medium text-foreground">
                      {currentUser.twoFactorEnabled
                        ? "Required (Simulated 6-digit code)"
                        : "Off (configure in Settings)"}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="font-medium text-foreground">Total Reserved Debit</span>
                    <span className="font-tabular font-semibold text-foreground">
                      {formatNaira(withdrawalNum + estimatedFee)}
                    </span>
                  </div>
                </div>

                {bankStatus === "Pending Verification" && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Note: Your saved settlement bank account is marked{" "}
                    <span className="font-medium text-foreground">Pending Verification</span>{" "}
                    (live NIBSS name enquiry is pending backend integration). Simulated withdrawal
                    requests remain queued for manual Admin Console review.
                  </p>
                )}

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
                  disabled={wdrSubmitting || isSuspended}
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {wdrSubmitting
                    ? "Submitting..."
                    : currentUser.twoFactorEnabled
                      ? "Continue to Simulated 2FA Confirmation"
                      : "Request Simulated Withdrawal"}
                </button>
              </form>
            )}

            {mode === "bank" && (
              <form onSubmit={handleBankSave} className="mt-5 space-y-4" noValidate>
                {bankError && <FormAlert>{bankError}</FormAlert>}

                <div className="rounded-lg border border-border bg-secondary/35 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Format Validation Notice:</span>{" "}
                  Saving bank details checks Nigerian 10-digit NUBAN format locally and sets the
                  account status to <span className="font-medium text-foreground">Pending Verification</span>.
                  Live NIBSS/Paystack account name enquiry is pending backend integration.
                </div>

                <div>
                  <label
                    htmlFor="bank-select"
                    className="block text-xs font-medium text-foreground"
                  >
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
                      onChange={(e) => {
                        setAccountNumber(e.target.value.replace(/\D/g, ""));
                        if (bankError) setBankError(null);
                      }}
                      placeholder="0123456789"
                      className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="bank-holder"
                      className="block text-xs font-medium text-foreground"
                    >
                      Account Holder Name
                    </label>
                    <input
                      id="bank-holder"
                      type="text"
                      value={accountName}
                      onChange={(e) => {
                        setAccountName(e.target.value);
                        if (bankError) setBankError(null);
                      }}
                      className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={bankSubmitting || isSuspended}
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {bankSubmitting ? "Saving..." : "Save Settlement Account"}
                </button>
              </form>
            )}
          </div>

          <div className="surface-card flex flex-col justify-between p-6 lg:col-span-5">
            <div>
              <h2 className="font-display text-xl font-medium text-foreground">
                Settlement Bank Account
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Destination Nigerian NUBAN account used for simulated withdrawal requests.
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
                    {currentUser.bankAccount.accountNumber || "Not configured"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Account Name</dt>
                  <dd className="text-right font-medium text-foreground">
                    {currentUser.bankAccount.accountName || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Verification Status</dt>
                  <dd>
                    <StatusText status={bankStatus} showIcon />
                  </dd>
                </div>
              </dl>

              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {bankStatus === "Simulated Verified"
                  ? "Simulated verified status in local test environment. Live NIBSS/Paystack bank name enquiry is pending backend integration."
                  : bankStatus === "Pending Verification"
                    ? "NUBAN format validated locally. Live bank name enquiry is pending backend integration (simulated review available in Admin Console)."
                    : "Save a 10-digit Nigerian NUBAN account before requesting withdrawals."}
              </p>
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
                Click any entry to inspect its full simulated receipt and balance impact breakdown
              </p>
            </div>
            <SegmentedFilter
              ariaLabel="Filter wallet history"
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
                  <th scope="col" className="px-6 py-3 font-medium">Reference</th>
                  <th scope="col" className="px-6 py-3 font-medium">Type</th>
                  <th scope="col" className="px-6 py-3 font-medium">Channel & Note</th>
                  <th scope="col" className="px-6 py-3 font-medium">Timestamp</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Status</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {historyRows.length === 0 ? (
                  <TableEmptyRow
                    colSpan={7}
                    title="No wallet records in this view"
                    description="Submit a simulated deposit or withdrawal above to create ledger entries."
                    action={
                      historyTab !== "all" ? (
                        <button
                          type="button"
                          onClick={() => setHistoryTab("all")}
                          className="inline-flex h-9 items-center rounded-lg border border-border px-3.5 text-xs font-medium text-foreground hover:bg-secondary"
                        >
                          Show All Activity
                        </button>
                      ) : undefined
                    }
                  />
                ) : (
                  historyRows.map((txn) => {
                    const impact = getTransactionLedgerImpact(txn);
                    const amountTone =
                      txn.status === "Declined"
                        ? "text-muted-foreground line-through"
                        : impact.isInflow
                          ? "text-success"
                          : "text-foreground";
                    return (
                      <tr
                        key={txn.id}
                        onClick={() => setSelectedTxn(txn)}
                        className="cursor-pointer hover:bg-secondary/25"
                      >
                        <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground">
                          {txn.reference}
                        </td>
                        <td className="px-6 py-3.5 font-medium text-foreground">{txn.type}</td>
                        <td className="px-6 py-3.5">
                          <p className="text-xs font-medium text-foreground">{txn.channel}</p>
                          {txn.note && (
                            <p className="text-[11px] text-muted-foreground">{txn.note}</p>
                          )}
                        </td>
                        <td className="font-tabular px-6 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(txn.createdAt)}
                        </td>
                        <td className="font-tabular px-6 py-3.5 text-right whitespace-nowrap">
                          <span className={`font-semibold ${amountTone}`}>
                            {impact.sign}
                            {formatNaira(txn.amount)}
                          </span>
                          {txn.fee > 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              Fee: {formatNaira(txn.fee)}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <StatusText status={txn.status} />
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            aria-label={`View receipt for ${txn.reference}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTxn(txn);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary"
                          >
                            <Receipt className="h-3 w-3" aria-hidden="true" />
                            Receipt
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Simulated 2FA Withdrawal Confirmation Modal */}
      <Modal
        open={twoFactorModalOpen}
        onClose={() => {
          setTwoFactorModalOpen(false);
          setTwoFactorError(null);
        }}
        title="Simulated 2FA Withdrawal Confirmation"
        subtitle="Two-Factor Safeguard Active"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleConfirmTwoFactorWithdrawal} className="space-y-4" noValidate>
          <div className="rounded-lg border border-border bg-secondary/40 p-3.5 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Withdrawal Amount</span>
              <span className="font-tabular font-semibold text-foreground">
                {formatNaira(withdrawalNum)}
              </span>
            </div>
            <div className="mt-1.5 flex justify-between gap-2">
              <span className="text-muted-foreground">Settlement Fee</span>
              <span className="font-tabular text-foreground">
                {estimatedFee > 0 ? formatNaira(estimatedFee) : "₦0 (Waived)"}
              </span>
            </div>
            <div className="mt-1.5 flex justify-between gap-2 border-t border-border pt-1.5">
              <span className="font-medium text-foreground">Total Reserved</span>
              <span className="font-tabular font-semibold text-foreground">
                {formatNaira(withdrawalNum + estimatedFee)}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-secondary/30 p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Simulated Authenticator Code
              </span>
              <button
                type="button"
                onClick={handleRegenerateTwoFactorCode}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                New code
              </button>
            </div>
            <p className="font-tabular mt-2 text-lg font-semibold tracking-widest text-foreground">
              {pendingTwoFactorCode ?? "------"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Test environment simulation only — live TOTP authenticator enforcement is pending
              backend integration.
            </p>
          </div>

          {twoFactorError && <FormAlert>{twoFactorError}</FormAlert>}

          <div>
            <label htmlFor="wdr-2fa-code" className="block text-xs font-medium text-foreground">
              Enter 6-Digit Confirmation Code
            </label>
            <input
              id="wdr-2fa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={twoFactorInput}
              onChange={(e) => {
                setTwoFactorInput(e.target.value.replace(/\D/g, ""));
                if (twoFactorError) setTwoFactorError(null);
              }}
              placeholder="6-digit code"
              className="font-tabular mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3.5 text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setTwoFactorModalOpen(false)}
              className="h-10 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={wdrSubmitting || twoFactorInput.length !== 6}
              className="h-10 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {wdrSubmitting ? "Confirming..." : "Confirm Withdrawal"}
            </button>
          </div>
        </form>
      </Modal>

      <TransactionReceiptModal transaction={selectedTxn} onClose={() => setSelectedTxn(null)} />
    </UserDashboardLayout>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallet } from "@/lib/wallet-store";
import { updateProfile } from "@/lib/account.functions";
import { getBanks, resolveBankAccount, type BankOption } from "@/lib/payments.functions";

export function BankDetailsForm({ onSaved, compact = false }: { onSaved?: () => void; compact?: boolean }) {
  const wallet = useWallet();
  const profile = wallet.profile;
  const save = useServerFn(updateProfile);
  const fetchBanks = useServerFn(getBanks);
  const resolve = useServerFn(resolveBankAccount);
  const { data: banks = [] } = useQuery<BankOption[]>({ queryKey: ["banks"], queryFn: () => fetchBanks(), staleTime: 3_600_000 });

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setBankCode(profile.bank_code ?? "");
    setAccountNumber(profile.account_number ?? "");
    setAccountName(profile.account_name ?? "");
    setVerified(Boolean(profile.account_name && profile.account_number && profile.bank_code));
  }, [profile]);

  useEffect(() => {
    if (accountNumber.length !== 10 || !bankCode) return;
    if (profile && accountNumber === profile.account_number && bankCode === profile.bank_code && profile.account_name) return;
    let cancelled = false;
    setVerifying(true);
    setVerifyError(null);
    setVerified(false);
    resolve({ data: { account_number: accountNumber, bank_code: bankCode } })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) { setAccountName(r.account_name); setVerified(true); }
        else { setAccountName(""); setVerifyError(r.error); }
      })
      .catch(() => !cancelled && setVerifyError("Verification failed. Try again."))
      .finally(() => !cancelled && setVerifying(false));
    return () => { cancelled = true; };
  }, [accountNumber, bankCode, profile, resolve]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!verified) return;
    setBusy(true);
    try {
      await save({ data: { bank_code: bankCode, bank_name: banks.find((b) => b.code === bankCode)?.name ?? "", account_number: accountNumber, account_name: accountName } });
      await wallet.refresh();
      toast.success("Bank account saved", { description: "Withdrawals will be paid into this account." });
      onSaved?.();
    } catch (err) {
      toast.error("Could not save bank account", { description: err instanceof Error ? err.message : "Please try again." });
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={`grid gap-4 ${compact ? "" : "sm:grid-cols-3"}`}>
        <div className="space-y-1.5">
          <Label>Bank</Label>
          <Select value={bankCode} onValueChange={setBankCode}>
            <SelectTrigger><SelectValue placeholder={banks.length ? "Select bank" : "Loading banks…"} /></SelectTrigger>
            <SelectContent className="max-h-72">
              {banks.map((b) => <SelectItem key={`${b.code}-${b.name}`} value={b.code}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Account number</Label>
          <Input inputMode="numeric" maxLength={10} placeholder="10 digits" value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="space-y-1.5">
          <Label>Account name</Label>
          <div className="relative">
            <Input value={accountName} readOnly placeholder="Verified automatically" className="pr-9" />
            {verifying && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            {verified && !verifying && <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success" />}
          </div>
        </div>
      </div>
      {verifyError && <p className="text-sm text-destructive">{verifyError}</p>}
      <Button type="submit" disabled={!verified || busy || verifying} className="rounded-full">
        {busy ? "Saving…" : "Save bank account"}
      </Button>
    </form>
  );
}

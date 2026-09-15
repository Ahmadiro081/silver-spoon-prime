import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallet } from "@/lib/wallet-store";
import { updateProfile } from "@/lib/account.functions";
import { getBanks, type BankOption } from "@/lib/payments.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState, type FormEvent } from "react";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  head: () => ({ meta: [{ title: "Profile — SILVER SPOON" }] }),
  component: Profile,
});

function Profile() {
  const wallet = useWallet();
  const profile = wallet.profile;
  const save = useServerFn(updateProfile);
  const fetchBanks = useServerFn(getBanks);

  const { data: banks = [] } = useQuery<BankOption[]>({
    queryKey: ["banks"],
    queryFn: () => fetchBanks(),
    staleTime: 60 * 60 * 1000,
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setBankCode(profile.bank_code ?? "");
    setAccountNumber(profile.account_number ?? "");
    setAccountName(profile.account_name ?? "");
  }, [profile]);

  const submit = async (e: FormEvent, section: string, payload: Record<string, string>) => {
    e.preventDefault();
    setBusy(section);
    try {
      await save({ data: payload });
      await wallet.refresh();
      toast.success(`${section} updated`);
    } catch (err) {
      toast.error(`Could not update ${section.toLowerCase()}`, {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
    setBusy(null);
  };

  const initials = (profile?.full_name || profile?.email || "SS")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <DashboardLayout title="Profile">
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="card-premium p-6 text-center">
          <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-gradient-ink font-display text-3xl text-primary-foreground">
            {initials}
          </div>
          <p className="font-display mt-4 text-xl">{profile?.full_name || "Your account"}</p>
          <p className="text-sm text-muted-foreground">{profile?.email ?? "—"}</p>
          <div className="mt-4 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
            Referral code<br />
            <span className="font-mono font-semibold text-foreground">{profile?.referral_code ?? "—"}</span>
          </div>
        </div>

        <div className="space-y-6">
          <form
            onSubmit={(e) => submit(e, "Personal details", { full_name: fullName, phone })}
            className="card-premium p-6"
          >
            <h3 className="font-display text-lg">Personal details</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={profile?.email ?? ""} readOnly disabled />
              </div>
              <div className="space-y-1.5">
                <Label>Phone number</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={busy === "Personal details"} className="mt-6 rounded-full">
              {busy === "Personal details" ? "Saving…" : "Save changes"}
            </Button>
          </form>

          <form
            onSubmit={(e) =>
              submit(e, "Bank details", {
                bank_code: bankCode,
                bank_name: banks.find((b) => b.code === bankCode)?.name ?? "",
                account_number: accountNumber,
                account_name: accountName,
              })
            }
            className="card-premium p-6"
          >
            <h3 className="font-display text-lg">Bank details</h3>
            <p className="mt-1 text-xs text-muted-foreground">Withdrawals are paid straight into this account.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Bank</Label>
                <Select value={bankCode} onValueChange={setBankCode}>
                  <SelectTrigger><SelectValue placeholder={banks.length ? "Select bank" : "Loading banks…"} /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {banks.map((b) => (
                      <SelectItem key={`${b.code}-${b.name}`} value={b.code}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Account number</Label>
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Account name</Label>
                <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={busy === "Bank details"} className="mt-6 rounded-full">
              {busy === "Bank details" ? "Saving…" : "Update bank"}
            </Button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

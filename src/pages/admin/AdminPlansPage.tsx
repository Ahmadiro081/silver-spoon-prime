import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { InvestmentPlan } from "@/types/domain";
import { formatNaira } from "@/utils/format";

export function AdminPlansPage() {
  const { plans, investments, adminCreatePlan, adminTogglePlanStatus } = useAppState();
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("Fixed Income");
  const [tagline, setTagline] = useState("");
  const [minAmount, setMinAmount] = useState("250000");
  const [maxAmount, setMaxAmount] = useState("10000000");
  const [durationDays, setDurationDays] = useState("60");
  const [targetReturnPercent, setTargetReturnPercent] = useState("4.5");
  const [riskBand, setRiskBand] = useState<InvestmentPlan["riskBand"]>("Moderate");

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    const res = adminCreatePlan({
      name,
      code: code || `SS-${Date.now().toString().slice(-4)}`,
      category,
      tagline: tagline || "Structured Naira allocation mandate",
      description: tagline || "Structured Naira allocation mandate governed by SILVER SPOON treasury desk.",
      minAmount: Number(minAmount),
      maxAmount: Number(maxAmount),
      durationDays: Number(durationDays),
      targetReturnPercent: Number(targetReturnPercent),
      riskBand,
      payoutFrequency: "At Maturity",
      managementFeePercent: 0.5,
      riskNote: "Illustrative target projection based on fixed-income allocation; returns are not guaranteed.",
    });
    if (!res.ok) {
      toast.error(res.error ?? "Unable to create plan.");
      return;
    }
    toast.success(`Created plan "${name}".`);
    setCreating(false);
    setName("");
    setCode("");
    setTagline("");
  };

  return (
    <AdminDashboardLayout
      title="Investment Plan Management"
      breadcrumb="Investment Plans"
      action={
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground whitespace-nowrap hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New Plan
        </button>
      }
    >
      <div className="space-y-6">
        {creating && (
          <form onSubmit={handleCreate} className="surface-card space-y-4 p-6">
            <h2 className="font-display text-xl font-medium text-foreground">
              Create Naira Investment Mandate
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-foreground">Plan Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Commercial Paper 60"
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground">Plan Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="SS-CP-60"
                  className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-foreground">Min Amount (₦)</label>
                <input
                  type="number"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground">Max Amount (₦)</label>
                <input
                  type="number"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground">Duration (Days)</label>
                <input
                  type="number"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground">Target Return (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={targetReturnPercent}
                  onChange={(e) => setTargetReturnPercent(e.target.value)}
                  className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-foreground">Summary Tagline</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Short-duration corporate note liquidity portfolio"
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground">Risk Band</label>
                <select
                  value={riskBand}
                  onChange={(e) => setRiskBand(e.target.value as InvestmentPlan["riskBand"])}
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="Low">Low</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Elevated">Elevated</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="h-9 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Publish Plan
              </button>
            </div>
          </form>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {plans.map((plan) => {
            const activeSub = investments.filter((i) => i.planId === plan.id && i.status === "Active");
            const activeVolume = activeSub.reduce((s, i) => s + i.principal, 0);
            return (
              <div key={plan.id} className="surface-card flex flex-col justify-between p-6">
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-tabular">{plan.code}</span>
                    <StatusText status={plan.status} showIcon />
                  </div>
                  <h3 className="font-display mt-2 text-xl font-medium text-foreground">
                    {plan.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>

                  <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-4 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Min / Max Allocation</dt>
                      <dd className="font-tabular mt-0.5 font-medium text-foreground">
                        {formatNaira(plan.minAmount)} – {formatNaira(plan.maxAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Tenor & Target Return</dt>
                      <dd className="font-tabular mt-0.5 font-medium text-foreground">
                        {plan.durationDays} days · {plan.targetReturnPercent}% ({plan.riskBand})
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Active Subscriptions</dt>
                      <dd className="font-tabular mt-0.5 font-medium text-foreground">
                        {activeSub.length} positions
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Allocated Capital</dt>
                      <dd className="font-tabular mt-0.5 font-semibold text-foreground">
                        {formatNaira(activeVolume)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  {plan.status === "Active" ? (
                    <button
                      type="button"
                      onClick={() => {
                        adminTogglePlanStatus(plan.id, "Paused");
                        toast.success(`${plan.name} paused for new subscriptions.`);
                      }}
                      className="h-9 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      Pause Plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        adminTogglePlanStatus(plan.id, "Active");
                        toast.success(`${plan.name} reactivated.`);
                      }}
                      className="h-9 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Activate Plan
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminDashboardLayout>
  );
}

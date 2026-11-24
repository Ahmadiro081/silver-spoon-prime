import { useState } from "react";
import { Link } from "react-router-dom";
import { PublicLayout } from "@/layouts/PublicLayout";
import { RiskDisclosure } from "@/components/common/Primitives";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";
import { calculateProjectedReturn } from "@/utils/calculations";
import { formatNaira } from "@/utils/format";

const LIFECYCLE = [
  {
    step: "01.",
    title: "Account Onboarding & KYC",
    detail:
      "Register with your legal name, email, and Nigerian phone number. Link your 10-digit NUBAN bank account so withdrawal disbursements only route to verified personal or corporate accounts.",
  },
  {
    step: "02.",
    title: "Naira Wallet Funding",
    detail:
      "Initiate a funding request via NIP bank transfer, corporate wire, or debit card. Confirmed deposits immediately increase your Available Naira Balance.",
  },
  {
    step: "03.",
    title: "Mandate Subscription",
    detail:
      "Select an investment plan matching your liquidity horizon (30 to 365 days). Principal moves from Available Balance to Active Investments for the tenor duration.",
  },
  {
    step: "04.",
    title: "Maturity Settlement & Payout",
    detail:
      "At maturity, principal returns to your Available Balance alongside any realized return. Request a withdrawal to your verified Nigerian bank account or re-allocate into a new mandate.",
  },
];

export function HowItWorksPage() {
  const { plans } = useAppState();
  const activePlans = plans.filter((p) => p.status === "Active");
  const [selectedPlanId, setSelectedPlanId] = useState(activePlans[1]?.id ?? activePlans[0]?.id ?? "");
  const [amount, setAmount] = useState(1_000_000);

  const selectedPlan = activePlans.find((p) => p.id === selectedPlanId) ?? activePlans[0];
  const projected = selectedPlan ? calculateProjectedReturn(amount, selectedPlan.targetReturnPercent) : 0;

  return (
    <PublicLayout>
      <section className="border-b border-border bg-card py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-medium text-muted-foreground">How SILVER SPOON Works</p>
          <h1 className="font-display mt-3 max-w-3xl text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
            A transparent lifecycle for every Naira you allocate.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            Understand how funds move between your available wallet, active investment mandates,
            referral ledger, and verified Nigerian bank account.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          {LIFECYCLE.map((item) => (
            <div key={item.step} className="surface-card p-6">
              <p className="font-tabular text-xs font-semibold text-muted-foreground">{item.step}</p>
              <h2 className="font-display mt-2 text-2xl font-medium text-foreground">{item.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>

        {/* Illustrative Projection Calculator */}
        {selectedPlan && (
          <div className="surface-card mt-14 p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="space-y-5 lg:col-span-7">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Illustrative Calculator</p>
                  <h2 className="font-display mt-1 text-2xl font-medium text-foreground">
                    Estimate a Naira Mandate Scenario
                  </h2>
                </div>

                <fieldset>
                  <legend className="block text-xs font-medium text-muted-foreground">
                    Choose Investment Mandate
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {activePlans.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        aria-pressed={plan.id === selectedPlan.id}
                        onClick={() => {
                          setSelectedPlanId(plan.id);
                          setAmount(Math.max(plan.minAmount, Math.min(amount, plan.maxAmount)));
                        }}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          plan.id === selectedPlan.id
                            ? "border-primary bg-secondary"
                            : "border-border bg-card hover:bg-secondary/50"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                        <p className="font-tabular mt-0.5 text-xs text-muted-foreground">
                          {plan.durationDays}d · {plan.targetReturnPercent}% target · {plan.riskBand} risk
                        </p>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="sim-amount" className="font-medium text-muted-foreground">
                      Allocation Principal (₦)
                    </label>
                    <span className="font-tabular font-semibold text-foreground">
                      {formatNaira(amount)}
                    </span>
                  </div>
                  <input
                    id="sim-amount"
                    type="range"
                    min={selectedPlan.minAmount}
                    max={Math.min(selectedPlan.maxAmount, 25_000_000)}
                    step={50_000}
                    value={Math.max(selectedPlan.minAmount, Math.min(amount, Math.min(selectedPlan.maxAmount, 25_000_000)))}
                    aria-valuetext={formatNaira(amount)}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="mt-3 w-full accent-primary"
                  />
                  <div className="font-tabular mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>Min: {formatNaira(selectedPlan.minAmount)}</span>
                    <span>Cap shown: {formatNaira(Math.min(selectedPlan.maxAmount, 25_000_000))}</span>
                  </div>
                </div>
              </div>

              <div
                aria-live="polite"
                className="flex flex-col justify-between rounded-xl border border-border bg-secondary/40 p-6 lg:col-span-5"
              >
                <div className="space-y-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Illustrative Maturity Projection ({selectedPlan.durationDays} Days)
                  </p>
                  <div className="space-y-3 border-y border-border py-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Principal Committed</span>
                      <span className="font-tabular font-medium text-foreground">{formatNaira(amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Target Return ({selectedPlan.targetReturnPercent}%)
                      </span>
                      <span className="font-tabular font-semibold text-success">
                        +{formatNaira(projected)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-3">
                      <span className="font-medium text-foreground">Illustrative Total at Maturity</span>
                      <span className="font-tabular text-lg font-semibold text-foreground">
                        {formatNaira(amount + projected)}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {selectedPlan.riskNote}
                  </p>
                </div>

                <Link
                  to="/dashboard/investments"
                  className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Allocate in Client Dashboard
                </Link>
              </div>
            </div>

            <div className="mt-6">
              <RiskDisclosure text={APP_CONFIG.disclosures.investmentRisk} />
            </div>
          </div>
        )}
      </section>
    </PublicLayout>
  );
}

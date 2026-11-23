import { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { PublicLayout } from "@/layouts/PublicLayout";
import { RiskDisclosure, SegmentedFilter, StatusText } from "@/components/common/Primitives";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";
import type { RiskBand } from "@/types/domain";
import { formatNaira } from "@/utils/format";

export function PlansPage() {
  const { plans } = useAppState();
  const [riskFilter, setRiskFilter] = useState<"ALL" | RiskBand>("ALL");

  const activePlans = plans.filter(
    (p) => p.status === "Active" && (riskFilter === "ALL" || p.riskBand === riskFilter),
  );

  return (
    <PublicLayout>
      <section className="border-b border-border bg-card py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Investment Plans</p>
              <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
                Structured Naira Mandates
              </h1>
              <p className="mt-3 max-w-2xl text-base text-muted-foreground">
                Every plan specifies minimum and maximum Naira allocations, lock-in duration,
                underlying instrument focus, management fees, and explicit risk classification.
              </p>
            </div>

            <SegmentedFilter
              value={riskFilter}
              onChange={setRiskFilter}
              options={[
                { label: "All Risk Bands", value: "ALL" },
                { label: "Low Risk", value: "Low" },
                { label: "Moderate Risk", value: "Moderate" },
                { label: "Elevated Risk", value: "Elevated" },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          {activePlans.map((plan) => (
            <article
              key={plan.id}
              className={`surface-card flex flex-col justify-between p-6 sm:p-7 ${
                plan.featured ? "border-primary/50" : ""
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-tabular">{plan.code}</span>
                  <span>
                    {plan.category} · <StatusText status={`${plan.riskBand} Risk`} />
                  </span>
                </div>

                <h2 className="font-display mt-3 text-2xl font-medium text-foreground">
                  {plan.name}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {plan.description}
                </p>

                <div className="mt-6 grid grid-cols-3 gap-4 border-y border-border py-4">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Target Return</p>
                    <p className="font-tabular mt-1 text-2xl font-semibold text-foreground">
                      {plan.targetReturnPercent}%
                    </p>
                    <p className="text-[11px] text-muted-foreground">Illustrative</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Duration</p>
                    <p className="font-tabular mt-1 text-2xl font-semibold text-foreground">
                      {plan.durationDays}d
                    </p>
                    <p className="text-[11px] text-muted-foreground">{plan.payoutFrequency}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Mgmt Fee</p>
                    <p className="font-tabular mt-1 text-2xl font-semibold text-foreground">
                      {plan.managementFeePercent}%
                    </p>
                    <p className="text-[11px] text-muted-foreground">Annualized</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Allocation Limits</p>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Minimum</dt>
                        <dd className="font-tabular font-medium text-foreground">
                          {formatNaira(plan.minAmount)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Maximum</dt>
                        <dd className="font-tabular font-medium text-foreground">
                          {formatNaira(plan.maxAmount)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-foreground">Underlying Focus</p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {plan.allocationFocus.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <ul className="mt-5 space-y-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-4 text-xs text-muted-foreground">{plan.riskNote}</p>
              </div>

              <div className="mt-6 flex items-center gap-3 pt-2">
                <Link
                  to="/dashboard/investments"
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Open Mandate in Dashboard
                </Link>
              </div>
            </article>
          ))}
        </div>

        {/* Comparison Matrix */}
        <div className="surface-card mt-12 overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-xl font-medium text-foreground">
              Mandate Specification Matrix
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Mandate</th>
                  <th className="px-6 py-3 font-medium">Minimum</th>
                  <th className="px-6 py-3 font-medium">Maximum</th>
                  <th className="px-6 py-3 font-medium">Tenor</th>
                  <th className="px-6 py-3 font-medium">Target Return*</th>
                  <th className="px-6 py-3 font-medium">Risk Band</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plans
                  .filter((p) => p.status === "Active")
                  .map((plan) => (
                    <tr key={plan.id} className="hover:bg-secondary/30">
                      <td className="px-6 py-3.5 font-medium text-foreground">{plan.name}</td>
                      <td className="font-tabular px-6 py-3.5 text-muted-foreground">
                        {formatNaira(plan.minAmount)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-muted-foreground">
                        {formatNaira(plan.maxAmount)}
                      </td>
                      <td className="font-tabular px-6 py-3.5 text-muted-foreground">
                        {plan.durationDays} days
                      </td>
                      <td className="font-tabular px-6 py-3.5 font-semibold text-foreground">
                        {plan.targetReturnPercent}%
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusText status={plan.riskBand} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8">
          <RiskDisclosure text={APP_CONFIG.disclosures.investmentRisk} />
        </div>
      </section>
    </PublicLayout>
  );
}

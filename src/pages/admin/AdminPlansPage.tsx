import { useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { Modal } from "@/components/common/Modal";
import { StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { InvestmentPlan } from "@/types/domain";
import { formatNaira } from "@/utils/format";

interface PlanFormValues {
  name: string;
  code: string;
  category: string;
  tagline: string;
  description: string;
  minAmount: string;
  maxAmount: string;
  durationDays: string;
  targetReturnPercent: string;
  riskBand: InvestmentPlan["riskBand"];
  payoutFrequency: InvestmentPlan["payoutFrequency"];
  managementFeePercent: string;
  riskNote: string;
  status: InvestmentPlan["status"];
}

const DEFAULT_CREATE_FORM: PlanFormValues = {
  name: "",
  code: "",
  category: "Fixed Income",
  tagline: "",
  description: "",
  minAmount: "250000",
  maxAmount: "10000000",
  durationDays: "60",
  targetReturnPercent: "4.5",
  riskBand: "Moderate",
  payoutFrequency: "At Maturity",
  managementFeePercent: "0.5",
  riskNote:
    "Illustrative target projection based on fixed-income allocation; returns are not guaranteed.",
  status: "Active",
};

export function AdminPlansPage() {
  const { plans, investments, adminCreatePlan, adminUpdatePlan, adminTogglePlanStatus } =
    useAppState();
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<PlanFormValues>(DEFAULT_CREATE_FORM);

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PlanFormValues>(DEFAULT_CREATE_FORM);

  const openEditModal = (plan: InvestmentPlan) => {
    setEditingPlanId(plan.id);
    setEditForm({
      name: plan.name,
      code: plan.code,
      category: plan.category,
      tagline: plan.tagline,
      description: plan.description,
      minAmount: String(plan.minAmount),
      maxAmount: String(plan.maxAmount),
      durationDays: String(plan.durationDays),
      targetReturnPercent: String(plan.targetReturnPercent),
      riskBand: plan.riskBand,
      payoutFrequency: plan.payoutFrequency,
      managementFeePercent: String(plan.managementFeePercent),
      riskNote: plan.riskNote,
      status: plan.status,
    });
  };

  const validatePlanForm = (values: PlanFormValues): string | null => {
    if (!values.name.trim()) return "Plan name is required.";
    const min = Number(values.minAmount);
    const max = Number(values.maxAmount);
    const days = Number(values.durationDays);
    const rate = Number(values.targetReturnPercent);
    if (!Number.isFinite(min) || min < 10_000) return "Minimum allocation must be at least ₦10,000.";
    if (!Number.isFinite(max) || max <= min) return "Maximum allocation must exceed minimum allocation.";
    if (!Number.isFinite(days) || days < 7) return "Tenor must be at least 7 days.";
    if (!Number.isFinite(rate) || rate <= 0) return "Target return must be greater than 0%.";
    return null;
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    const err = validatePlanForm(createForm);
    if (err) {
      toast.error(err);
      return;
    }

    const res = adminCreatePlan({
      name: createForm.name.trim(),
      code: createForm.code.trim() || `SS-${Date.now().toString().slice(-4)}`,
      category: createForm.category.trim() || "Fixed Income",
      tagline: createForm.tagline.trim() || "Structured Naira allocation mandate",
      description:
        createForm.description.trim() ||
        createForm.tagline.trim() ||
        "Structured Naira allocation mandate governed by SILVER SPOON treasury desk.",
      minAmount: Number(createForm.minAmount),
      maxAmount: Number(createForm.maxAmount),
      durationDays: Number(createForm.durationDays),
      targetReturnPercent: Number(createForm.targetReturnPercent),
      riskBand: createForm.riskBand,
      payoutFrequency: createForm.payoutFrequency,
      managementFeePercent: Number(createForm.managementFeePercent) || 0,
      riskNote:
        createForm.riskNote.trim() ||
        "Illustrative target projection; market returns are not guaranteed.",
    });

    if (!res.ok) {
      toast.error(res.error ?? "Unable to create plan.");
      return;
    }
    toast.success(`Created plan "${createForm.name.trim()}".`);
    setCreating(false);
    setCreateForm(DEFAULT_CREATE_FORM);
  };

  const handleUpdate = (e: FormEvent) => {
    e.preventDefault();
    if (!editingPlanId) return;

    const err = validatePlanForm(editForm);
    if (err) {
      toast.error(err);
      return;
    }

    const res = adminUpdatePlan(editingPlanId, {
      name: editForm.name.trim(),
      code: editForm.code.trim(),
      category: editForm.category.trim(),
      tagline: editForm.tagline.trim(),
      description: editForm.description.trim(),
      minAmount: Number(editForm.minAmount),
      maxAmount: Number(editForm.maxAmount),
      durationDays: Number(editForm.durationDays),
      targetReturnPercent: Number(editForm.targetReturnPercent),
      riskBand: editForm.riskBand,
      payoutFrequency: editForm.payoutFrequency,
      managementFeePercent: Number(editForm.managementFeePercent) || 0,
      riskNote: editForm.riskNote.trim(),
      status: editForm.status,
    });

    if (!res.ok) {
      toast.error(res.error ?? "Unable to update investment plan.");
      return;
    }
    toast.success(`Updated investment plan "${editForm.name.trim()}".`);
    setEditingPlanId(null);
  };

  return (
    <AdminDashboardLayout
      title="Investment Plan Management"
      breadcrumb="Investment Plans"
      action={
        <button
          type="button"
          onClick={() => {
            setCreateForm(DEFAULT_CREATE_FORM);
            setCreating(true);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground whitespace-nowrap hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New Plan
        </button>
      }
    >
      <div className="space-y-6">
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
                      <dt className="text-muted-foreground">Payout & Mgmt Fee</dt>
                      <dd className="font-tabular mt-0.5 font-medium text-foreground">
                        {plan.payoutFrequency} · {plan.managementFeePercent}% fee
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Active Subscriptions</dt>
                      <dd className="font-tabular mt-0.5 font-semibold text-foreground">
                        {activeSub.length} ({formatNaira(activeVolume)})
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(plan)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3.5 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Plan
                  </button>
                  {plan.status === "Active" ? (
                    <button
                      type="button"
                      onClick={() => {
                        const res = adminTogglePlanStatus(plan.id, "Paused");
                        if (res.ok) toast.success(`${plan.name} paused for new subscriptions.`);
                      }}
                      className="h-9 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      Pause Plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const res = adminTogglePlanStatus(plan.id, "Active");
                        if (res.ok) toast.success(`${plan.name} reactivated.`);
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

      {/* Create Investment Plan Modal */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create Naira Investment Mandate"
        subtitle="New Treasury Product"
        maxWidthClass="max-w-2xl"
      >
        <PlanEditorForm
          values={createForm}
          onChange={setCreateForm}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
          submitLabel="Publish Plan"
          showStatusField={false}
        />
      </Modal>

      {/* Edit Investment Plan Modal */}
      <Modal
        open={Boolean(editingPlanId)}
        onClose={() => setEditingPlanId(null)}
        title="Edit Investment Plan"
        subtitle={editingPlanId ? `Plan ID: ${editingPlanId}` : undefined}
        maxWidthClass="max-w-2xl"
      >
        <PlanEditorForm
          values={editForm}
          onChange={setEditForm}
          onSubmit={handleUpdate}
          onCancel={() => setEditingPlanId(null)}
          submitLabel="Save Plan Changes"
          showStatusField
        />
      </Modal>
    </AdminDashboardLayout>
  );
}

function PlanEditorForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  showStatusField,
}: {
  values: PlanFormValues;
  onChange: (next: PlanFormValues) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  showStatusField: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-foreground">Plan Name</label>
          <input
            type="text"
            required
            value={values.name}
            onChange={(e) => onChange({ ...values, name: e.target.value })}
            placeholder="Commercial Paper 60"
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground">Plan Code</label>
          <input
            type="text"
            value={values.code}
            onChange={(e) => onChange({ ...values, code: e.target.value })}
            placeholder="SS-CP-60"
            className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground">Category</label>
          <input
            type="text"
            value={values.category}
            onChange={(e) => onChange({ ...values, category: e.target.value })}
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-foreground">Min Amount (₦)</label>
          <input
            type="number"
            min={10000}
            required
            value={values.minAmount}
            onChange={(e) => onChange({ ...values, minAmount: e.target.value })}
            className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground">Max Amount (₦)</label>
          <input
            type="number"
            min={10000}
            required
            value={values.maxAmount}
            onChange={(e) => onChange({ ...values, maxAmount: e.target.value })}
            className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground">Tenor (Days)</label>
          <input
            type="number"
            min={7}
            required
            value={values.durationDays}
            onChange={(e) => onChange({ ...values, durationDays: e.target.value })}
            className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground">Target Return (%)</label>
          <input
            type="number"
            step="0.1"
            min={0.1}
            required
            value={values.targetReturnPercent}
            onChange={(e) => onChange({ ...values, targetReturnPercent: e.target.value })}
            className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-foreground">Risk Band</label>
          <select
            value={values.riskBand}
            onChange={(e) =>
              onChange({ ...values, riskBand: e.target.value as InvestmentPlan["riskBand"] })
            }
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="Low">Low</option>
            <option value="Moderate">Moderate</option>
            <option value="Elevated">Elevated</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground">Payout Frequency</label>
          <select
            value={values.payoutFrequency}
            onChange={(e) =>
              onChange({
                ...values,
                payoutFrequency: e.target.value as InvestmentPlan["payoutFrequency"],
              })
            }
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="At Maturity">At Maturity</option>
            <option value="Quarterly">Quarterly</option>
            <option value="Monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground">Management Fee (%)</label>
          <input
            type="number"
            step="0.05"
            min={0}
            value={values.managementFeePercent}
            onChange={(e) => onChange({ ...values, managementFeePercent: e.target.value })}
            className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className={showStatusField ? "sm:col-span-2" : "sm:col-span-3"}>
          <label className="block text-xs font-medium text-foreground">Summary Tagline</label>
          <input
            type="text"
            value={values.tagline}
            onChange={(e) => onChange({ ...values, tagline: e.target.value })}
            placeholder="Short-duration corporate note liquidity portfolio"
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
        {showStatusField && (
          <div>
            <label className="block text-xs font-medium text-foreground">Plan Status</label>
            <select
              value={values.status}
              onChange={(e) =>
                onChange({ ...values, status: e.target.value as InvestmentPlan["status"] })
              }
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
              <option value="Archived">Archived</option>
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground">Mandate Description</label>
        <textarea
          rows={2}
          value={values.description}
          onChange={(e) => onChange({ ...values, description: e.target.value })}
          placeholder="Outline instrument backing, liquidity profile, and treasury mandate scope..."
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground">Risk Disclosure Note</label>
        <textarea
          rows={2}
          value={values.riskNote}
          onChange={(e) => onChange({ ...values, riskNote: e.target.value })}
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="h-9 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

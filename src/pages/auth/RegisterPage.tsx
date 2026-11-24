import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/AuthLayout";
import { FormAlert, PasswordInput } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register } = useAppState();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+234 ");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(searchParams.get("ref") ?? "");
  const [accepted, setAccepted] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!accepted) {
      setError("Please confirm you have read the Terms & Risk Disclosures.");
      return;
    }
    const res = register({ fullName, email, phone, password, referralCode });
    if (!res.ok || !res.data) {
      setError(res.error ?? "Unable to create account.");
      return;
    }
    toast.success("Account created. Complete simulated email verification to finish onboarding.");
    navigate(`/verify-email?email=${encodeURIComponent(res.data.email)}`);
  };

  return (
    <AuthLayout
      title="Open a SILVER SPOON account"
      subtitle="Create an independent Naira wealth profile starting with a clean ₦0 wallet ledger."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-foreground hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <FormAlert>{error}</FormAlert>}

        <div>
          <label htmlFor="reg-name" className="block text-xs font-medium text-foreground">
            Full Legal Name
          </label>
          <input
            id="reg-name"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Full legal name"
            required
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="reg-email" className="block text-xs font-medium text-foreground">
              Email Address
            </label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="name@domain.ng"
              required
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="reg-phone" className="block text-xs font-medium text-foreground">
              Phone Number
            </label>
            <input
              id="reg-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (error) setError(null);
              }}
              placeholder="+234 803 000 0000"
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="reg-pass" className="block text-xs font-medium text-foreground">
              Password (min. 8 chars)
            </label>
            <PasswordInput
              id="reg-pass"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              required
              className="bg-card"
            />
          </div>
          <div>
            <label htmlFor="reg-ref" className="block text-xs font-medium text-foreground">
              Referral Code (optional)
            </label>
            <input
              id="reg-ref"
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="SS-XXXXXX"
              className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 rounded border-input accent-primary"
          />
          <span>
            I accept the{" "}
            <Link to="/terms" className="font-medium text-foreground underline">
              Terms & Risk Disclosures
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="font-medium text-foreground underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Create Client Account
        </button>
      </form>
    </AuthLayout>
  );
}

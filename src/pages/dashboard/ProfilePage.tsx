import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { SafeImage } from "@/components/common/SafeImage";
import { StatusText } from "@/components/common/Primitives";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";
import { formatDate, formatDateTime } from "@/utils/format";

export function ProfilePage() {
  const { currentUser, resetVersion, updateProfile } = useAppState();
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [phone, setPhone] = useState(currentUser.phone);
  const [city, setCity] = useState(currentUser.city);
  const [address, setAddress] = useState(currentUser.address);

  useEffect(() => {
    setFullName(currentUser.fullName);
    setPhone(currentUser.phone);
    setCity(currentUser.city);
    setAddress(currentUser.address);
  }, [
    currentUser.id,
    currentUser.fullName,
    currentUser.phone,
    currentUser.city,
    currentUser.address,
    resetVersion,
  ]);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const res = updateProfile({ fullName, phone, city, address });
    if (!res.ok) {
      toast.error(res.error ?? "Unable to update profile.");
      return;
    }
    toast.success("Client profile updated.");
  };

  return (
    <UserDashboardLayout title="Client Profile" breadcrumb="Profile">
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="surface-card p-6 lg:col-span-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 overflow-hidden rounded-full border border-border">
              <SafeImage
                src={currentUser.avatarUrl ?? APP_CONFIG.assets.clientAvatar}
                alt={currentUser.fullName}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h2 className="font-display truncate text-xl font-medium text-foreground">
                {currentUser.fullName}
              </h2>
              <p className="truncate text-xs text-muted-foreground">{currentUser.email}</p>
            </div>
          </div>

          <dl className="mt-6 space-y-3 border-t border-border pt-5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Account ID</dt>
              <dd className="font-tabular font-medium text-foreground">{currentUser.id}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Email Verification</dt>
              <dd>
                {currentUser.emailVerified ? (
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verified
                  </span>
                ) : (
                  <Link
                    to={`/verify-email?email=${encodeURIComponent(currentUser.email)}`}
                    className="inline-flex items-center gap-1 font-medium text-warning hover:underline"
                  >
                    <MailWarning className="h-3.5 w-3.5" />
                    Verify Email
                  </Link>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Client Tier</dt>
              <dd className="font-medium text-foreground">{currentUser.tier}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">KYC Level</dt>
              <dd className="font-medium text-foreground">{currentUser.kycLevel}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusText status={currentUser.status} showIcon />
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Member Since</dt>
              <dd className="font-tabular text-foreground">{formatDate(currentUser.joinedAt)}</dd>
            </div>
          </dl>

          {currentUser.kycNote && (
            <div className="mt-5 rounded-lg border border-border bg-secondary/35 p-3 text-xs">
              <p className="font-medium text-foreground">Compliance / KYC Note</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">{currentUser.kycNote}</p>
              {currentUser.kycUpdatedAt && (
                <p className="font-tabular mt-1.5 text-[11px] text-muted-foreground">
                  Updated {formatDateTime(currentUser.kycUpdatedAt)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="surface-card p-6 lg:col-span-8">
          <h2 className="font-display text-xl font-medium text-foreground">Personal Information</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Update contact details reflected on portfolio statements and KYC records.
          </p>

          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="p-name" className="block text-xs font-medium text-foreground">
                  Full Legal Name
                </label>
                <input
                  id="p-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="p-phone" className="block text-xs font-medium text-foreground">
                  Phone Number
                </label>
                <input
                  id="p-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="p-city" className="block text-xs font-medium text-foreground">
                  City
                </label>
                <input
                  id="p-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="p-email" className="block text-xs font-medium text-foreground">
                  Registered Email
                </label>
                <input
                  id="p-email"
                  type="email"
                  disabled
                  value={currentUser.email}
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3.5 text-sm text-muted-foreground"
                />
              </div>
            </div>

            <div>
              <label htmlFor="p-address" className="block text-xs font-medium text-foreground">
                Residential / Corporate Address
              </label>
              <input
                id="p-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Save Profile Changes
            </button>
          </form>
        </div>
      </div>
    </UserDashboardLayout>
  );
}

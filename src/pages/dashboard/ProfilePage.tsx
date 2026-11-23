import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { SafeImage } from "@/components/common/SafeImage";
import { StatusText } from "@/components/common/Primitives";
import { APP_CONFIG } from "@/config/app";
import { useAppState } from "@/context/AppStateContext";
import { formatDate } from "@/utils/format";

export function ProfilePage() {
  const { currentUser, updateProfile } = useAppState();
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [phone, setPhone] = useState(currentUser.phone);
  const [city, setCity] = useState(currentUser.city);
  const [address, setAddress] = useState(currentUser.address);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    updateProfile({ fullName, phone, city, address });
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
            <div>
              <h2 className="font-display text-xl font-medium text-foreground">
                {currentUser.fullName}
              </h2>
              <p className="text-xs text-muted-foreground">{currentUser.email}</p>
            </div>
          </div>

          <dl className="mt-6 space-y-3 border-t border-border pt-5 text-xs">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Account ID</dt>
              <dd className="font-tabular font-medium text-foreground">{currentUser.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Client Tier</dt>
              <dd className="font-medium text-foreground">{currentUser.tier}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">KYC Level</dt>
              <dd className="font-medium text-foreground">{currentUser.kycLevel}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusText status={currentUser.status} showIcon />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Member Since</dt>
              <dd className="font-tabular text-foreground">{formatDate(currentUser.joinedAt)}</dd>
            </div>
          </dl>
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

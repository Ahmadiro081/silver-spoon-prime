import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileCheck2, MailWarning, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { SafeImage } from "@/components/common/SafeImage";
import { FormAlert, StatusText } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import type { KycDocumentType } from "@/types/domain";
import { formatDate, formatDateTime, getInitials } from "@/utils/format";

const ID_TYPES: KycDocumentType[] = [
  "NIN",
  "International Passport",
  "Driver's License",
  "Voter's Card",
];

export function ProfilePage() {
  const { currentUser, userKycSubmissions, resetVersion, updateProfile, submitKycApplication } =
    useAppState();

  // Personal profile state
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [phone, setPhone] = useState(currentUser.phone);
  const [city, setCity] = useState(currentUser.city);
  const [address, setAddress] = useState(currentUser.address);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Simulated KYC submission state
  const defaultTargetTier: "Tier 2" | "Tier 3" =
    currentUser.kycLevel === "Tier 1" ? "Tier 2" : "Tier 3";
  const [targetTier, setTargetTier] = useState<"Tier 2" | "Tier 3">(defaultTargetTier);
  const [idType, setIdType] = useState<KycDocumentType>("NIN");
  const [idNumber, setIdNumber] = useState("");
  const [bvn, setBvn] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("1990-05-15");
  const [kycAddress, setKycAddress] = useState(currentUser.address);
  const [idDocumentName, setIdDocumentName] = useState("");
  const [proofOfAddressName, setProofOfAddressName] = useState("");
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);

  useEffect(() => {
    setFullName(currentUser.fullName);
    setPhone(currentUser.phone);
    setCity(currentUser.city);
    setAddress(currentUser.address);
    setKycAddress(currentUser.address);
    setTargetTier(currentUser.kycLevel === "Tier 1" ? "Tier 2" : "Tier 3");
    setProfileError(null);
    setKycError(null);
  }, [
    currentUser.id,
    currentUser.fullName,
    currentUser.phone,
    currentUser.city,
    currentUser.address,
    currentUser.kycLevel,
    resetVersion,
  ]);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    const res = updateProfile({ fullName, phone, city, address });
    if (!res.ok) {
      const msg = res.error ?? "Unable to update profile.";
      setProfileError(msg);
      toast.error(msg);
      return;
    }
    toast.success("Client profile updated.");
  };

  const handleFileSelect = (
    e: ChangeEvent<HTMLInputElement>,
    setter: (filename: string) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) {
      setter("");
      return;
    }
    setter(file.name);
    if (kycError) setKycError(null);
  };

  const handleKycSubmit = (e: FormEvent) => {
    e.preventDefault();
    setKycError(null);
    setKycSubmitting(true);
    const res = submitKycApplication({
      targetTier,
      idType,
      idNumber,
      bvn,
      dateOfBirth,
      residentialAddress: kycAddress,
      idDocumentName,
      proofOfAddressName: targetTier === "Tier 3" ? proofOfAddressName : undefined,
    });
    setKycSubmitting(false);

    if (!res.ok || !res.data) {
      const msg = res.error ?? "Unable to submit KYC application.";
      setKycError(msg);
      toast.error(msg);
      return;
    }

    setIdNumber("");
    setBvn("");
    setIdDocumentName("");
    setProofOfAddressName("");
    toast.success(
      `Simulated ${res.data.targetTier} KYC application (${res.data.id}) submitted for compliance review.`,
    );
  };

  const pendingSubmission = userKycSubmissions.find((s) => s.status === "Under Review");
  const isMaxKycActive = currentUser.status === "Active" && currentUser.kycLevel === "Tier 3";
  const isSuspended = currentUser.status === "Suspended";
  const canSubmitKyc =
    currentUser.role === "investor" && !isMaxKycActive && !pendingSubmission && !isSuspended;

  return (
    <UserDashboardLayout title="Client Profile" breadcrumb="Profile">
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="surface-card p-6 lg:col-span-4">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-primary text-lg font-semibold text-primary-foreground">
              {currentUser.avatarUrl ? (
                <SafeImage
                  src={currentUser.avatarUrl}
                  alt={currentUser.fullName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span aria-hidden="true">{getInitials(currentUser.fullName || "SS")}</span>
              )}
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
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Verified
                  </span>
                ) : (
                  <Link
                    to={`/verify-email?email=${encodeURIComponent(currentUser.email)}`}
                    className="inline-flex items-center gap-1 font-medium text-warning hover:underline"
                  >
                    <MailWarning className="h-3.5 w-3.5" aria-hidden="true" />
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

        <div className="space-y-6 lg:col-span-8">
          <div className="surface-card p-6">
            <h2 className="font-display text-xl font-medium text-foreground">Personal Information</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Update contact details reflected on portfolio statements and KYC records.
            </p>

            <form onSubmit={handleSave} className="mt-6 space-y-4" noValidate>
              {profileError && <FormAlert>{profileError}</FormAlert>}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="p-name" className="block text-xs font-medium text-foreground">
                    Full Legal Name
                  </label>
                  <input
                    id="p-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (profileError) setProfileError(null);
                    }}
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
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (profileError) setProfileError(null);
                    }}
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
                    autoComplete="address-level2"
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
                  autoComplete="street-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <button
                type="submit"
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
              >
                Save Profile Changes
              </button>
            </form>
          </div>

          {/* Investor KYC Submission & Tier Upgrade Section */}
          {currentUser.role === "investor" && (
            <section id="kyc" className="surface-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-medium text-foreground">
                    KYC Verification & Tier Upgrade
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Submit identity documentation for compliance review. Tier 2 or Tier 3 clearance
                    is required for withdrawal eligibility.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium text-foreground">{currentUser.kycLevel}</span>
                  <span aria-hidden="true" className="text-muted-foreground">·</span>
                  <StatusText status={currentUser.status} />
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-secondary/35 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Simulated KYC Workflow:</span>{" "}
                Document formats and fields are validated locally and queued for review in the Admin
                Console. Only masked last-4 digits and filenames are retained in browser state. Live
                NIMC/NIBSS identity checks and encrypted document storage are pending backend
                integration.
              </div>

              {isMaxKycActive && (
                <FormAlert tone="success" className="mt-5">
                  Your account holds <span className="font-semibold">Tier 3</span> compliance
                  clearance (simulated). No further KYC submission is required.
                </FormAlert>
              )}

              {isSuspended && (
                <FormAlert className="mt-5">
                  KYC submissions are disabled while this account is suspended. Contact compliance
                  support.
                </FormAlert>
              )}

              {pendingSubmission && (
                <div className="mt-5 rounded-lg border border-warning/30 bg-warning/5 p-4 text-xs" role="status">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">
                      Application {pendingSubmission.id} ({pendingSubmission.targetTier}) — Under
                      Review
                    </p>
                    <StatusText status={pendingSubmission.status} showIcon />
                  </div>
                  <p className="mt-1.5 leading-relaxed text-muted-foreground">
                    Submitted on {formatDateTime(pendingSubmission.submittedAt)} with{" "}
                    {pendingSubmission.idType} (••••{pendingSubmission.idNumberLast4}) and BVN
                    (••••{pendingSubmission.bvnLast4}). Review or approve this application from the
                    Admin Console &rarr; User Management drawer.
                  </p>
                </div>
              )}

              {canSubmitKyc && (
                <form onSubmit={handleKycSubmit} className="mt-5 space-y-4" noValidate>
                  {kycError && <FormAlert>{kycError}</FormAlert>}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="kyc-target-tier"
                        className="block text-xs font-medium text-foreground"
                      >
                        Requested KYC Tier
                      </label>
                      <select
                        id="kyc-target-tier"
                        value={targetTier}
                        onChange={(e) => {
                          setTargetTier(e.target.value as "Tier 2" | "Tier 3");
                          if (kycError) setKycError(null);
                        }}
                        className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {currentUser.kycLevel === "Tier 1" && (
                          <option value="Tier 2">Tier 2 (Standard BVN + Government ID)</option>
                        )}
                        <option value="Tier 3">
                          Tier 3 (Full Institutional + Proof of Address)
                        </option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="kyc-id-type"
                        className="block text-xs font-medium text-foreground"
                      >
                        Government ID Type
                      </label>
                      <select
                        id="kyc-id-type"
                        value={idType}
                        onChange={(e) => {
                          setIdType(e.target.value as KycDocumentType);
                          if (kycError) setKycError(null);
                        }}
                        className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {ID_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="kyc-id-number"
                        className="block text-xs font-medium text-foreground"
                      >
                        {idType === "NIN" ? "11-Digit NIN" : `${idType} Number`}
                      </label>
                      <input
                        id="kyc-id-number"
                        type="text"
                        required
                        value={idNumber}
                        onChange={(e) => {
                          const raw =
                            idType === "NIN" ? e.target.value.replace(/\D/g, "") : e.target.value;
                          setIdNumber(raw);
                          if (kycError) setKycError(null);
                        }}
                        maxLength={idType === "NIN" ? 11 : 20}
                        placeholder={idType === "NIN" ? "12345678901" : "A01234567"}
                        className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="kyc-bvn"
                        className="block text-xs font-medium text-foreground"
                      >
                        11-Digit BVN (Simulated Input)
                      </label>
                      <input
                        id="kyc-bvn"
                        type="text"
                        inputMode="numeric"
                        required
                        maxLength={11}
                        value={bvn}
                        onChange={(e) => {
                          setBvn(e.target.value.replace(/\D/g, ""));
                          if (kycError) setKycError(null);
                        }}
                        placeholder="22123456789"
                        className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="kyc-dob"
                        className="block text-xs font-medium text-foreground"
                      >
                        Date of Birth
                      </label>
                      <input
                        id="kyc-dob"
                        type="date"
                        required
                        value={dateOfBirth}
                        onChange={(e) => {
                          setDateOfBirth(e.target.value);
                          if (kycError) setKycError(null);
                        }}
                        className="font-tabular mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="kyc-address"
                        className="block text-xs font-medium text-foreground"
                      >
                        Verified Residential / Corporate Address
                      </label>
                      <input
                        id="kyc-address"
                        type="text"
                        required
                        value={kycAddress}
                        onChange={(e) => {
                          setKycAddress(e.target.value);
                          if (kycError) setKycError(null);
                        }}
                        placeholder="Full Nigerian street address"
                        className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <span className="block text-xs font-medium text-foreground">
                        Government ID Document (Simulated Attachment)
                      </span>
                      <label
                        htmlFor="kyc-id-doc"
                        className="mt-1.5 flex h-10 cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-input bg-secondary/30 px-3 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring"
                      >
                        <span className="truncate">
                          {idDocumentName || "Choose PDF, JPG, or PNG file..."}
                        </span>
                        {idDocumentName ? (
                          <FileCheck2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        ) : (
                          <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                        <input
                          id="kyc-id-doc"
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          aria-label="Government ID Document (Simulated Attachment)"
                          onChange={(e) => handleFileSelect(e, setIdDocumentName)}
                          className="sr-only"
                        />
                      </label>
                    </div>

                    <div>
                      <span className="block text-xs font-medium text-foreground">
                        Proof of Address {targetTier === "Tier 3" ? "(Required for Tier 3)" : "(Optional)"}
                      </span>
                      <label
                        htmlFor="kyc-poa-doc"
                        className="mt-1.5 flex h-10 cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-input bg-secondary/30 px-3 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring"
                      >
                        <span className="truncate">
                          {proofOfAddressName || "Utility bill or bank statement..."}
                        </span>
                        {proofOfAddressName ? (
                          <FileCheck2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        ) : (
                          <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                        <input
                          id="kyc-poa-doc"
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          aria-label={`Proof of Address ${targetTier === "Tier 3" ? "(Required for Tier 3)" : "(Optional)"}`}
                          onChange={(e) => handleFileSelect(e, setProofOfAddressName)}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={kycSubmitting}
                    className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {kycSubmitting
                      ? "Submitting Application..."
                      : `Submit Simulated ${targetTier} KYC Application`}
                  </button>
                </form>
              )}

              {/* Submission History */}
              {userKycSubmissions.length > 0 && (
                <div className="mt-6 border-t border-border pt-5">
                  <h3 className="text-xs font-semibold text-foreground">
                    KYC Submission History
                  </h3>
                  <div className="mt-3 space-y-2.5">
                    {userKycSubmissions.map((sub) => (
                      <div
                        key={sub.id}
                        className="rounded-lg border border-border bg-secondary/25 p-3.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {sub.targetTier} · {sub.idType} (••••{sub.idNumberLast4}) · BVN ••••
                            {sub.bvnLast4}
                          </span>
                          <StatusText status={sub.status} showIcon />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          ID File: {sub.idDocumentName}
                          {sub.proofOfAddressName ? ` · Address File: ${sub.proofOfAddressName}` : ""}
                          {" · "}Submitted {formatDateTime(sub.submittedAt)}
                        </p>
                        {sub.reviewerNote && (
                          <p className="mt-1.5 text-[11px] text-foreground">
                            Reviewer Note: {sub.reviewerNote}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </UserDashboardLayout>
  );
}

import { useState, type FormEvent } from "react";
import { CheckCircle2, Mail, MapPin, Phone } from "lucide-react";
import { PublicLayout } from "@/layouts/PublicLayout";
import { FormAlert } from "@/components/common/Primitives";
import { APP_CONFIG } from "@/config/app";

export function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("Private Wealth Onboarding");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.includes("@") || message.trim().length < 10) {
      setError("Please provide your name, a valid email address, and a message of at least 10 characters.");
      return;
    }
    setError(null);
    setSubmitted(true);
  };

  return (
    <PublicLayout>
      <section className="border-b border-border bg-card py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-medium text-muted-foreground">Client Concierge & Compliance</p>
          <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-foreground">
            Speak with the SILVER SPOON Desk
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">
            Our Lagos, Abuja, and Port Harcourt relationship officers respond to all inquiries within
            one business day.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-5">
            <div className="surface-card p-6">
              <h2 className="font-display text-xl font-medium text-foreground">Office Directory</h2>
              <div className="mt-5 space-y-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-foreground">Lagos Headquarters</p>
                    <p>{APP_CONFIG.support.headquarters}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-foreground">Email Channels</p>
                    <p>{APP_CONFIG.support.email}</p>
                    <p className="text-xs">{APP_CONFIG.support.complianceEmail}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-foreground">Direct Desk</p>
                    <p className="font-tabular">{APP_CONFIG.support.phone}</p>
                    <p className="text-xs">{APP_CONFIG.support.hours}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="surface-card p-6 sm:p-8 lg:col-span-7">
            {submitted ? (
              <div className="py-10 text-center" role="status">
                <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden="true" />
                <h2 className="font-display mt-4 text-2xl font-medium text-foreground">
                  Inquiry Logged
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Thank you, {name}. Your message regarding <strong>{topic}</strong> has been queued
                  for our Victoria Island client desk ({email}).
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setName("");
                    setEmail("");
                    setMessage("");
                  }}
                  className="mt-6 inline-flex h-10 items-center rounded-lg border border-border px-5 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <h2 className="font-display text-2xl font-medium text-foreground">Send an Inquiry</h2>
                {error && <FormAlert>{error}</FormAlert>}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="c-name" className="block text-xs font-medium text-foreground">
                      Full Name
                    </label>
                    <input
                      id="c-name"
                      type="text"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Your full name"
                      className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label htmlFor="c-email" className="block text-xs font-medium text-foreground">
                      Email Address
                    </label>
                    <input
                      id="c-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="name@company.ng"
                      className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="c-topic" className="block text-xs font-medium text-foreground">
                    Inquiry Desk
                  </label>
                  <select
                    id="c-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option>Private Wealth Onboarding</option>
                    <option>Corporate Treasury Allocation</option>
                    <option>Wallet Funding & Settlements</option>
                    <option>Compliance & KYC Verification</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="c-msg" className="block text-xs font-medium text-foreground">
                    Message
                  </label>
                  <textarea
                    id="c-msg"
                    rows={5}
                    required
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Share your investment horizon, corporate treasury needs, or support question..."
                    className="mt-1.5 w-full rounded-lg border border-input bg-background p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <button
                  type="submit"
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
                >
                  Submit Message
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

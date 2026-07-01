import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layouts/PublicLayout";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [
    { title: "Privacy Policy — SILVER SPOON" },
    { name: "description", content: "How SILVER SPOON collects, uses and protects your personal information." },
  ]}),
  component: Privacy,
});

const sections = [
  { h: "1. What we collect", p: "Identity data (name, BVN, government ID), contact data (email, phone, address), financial data (bank account, deposits, withdrawals) and usage data (device, IP, session logs)." },
  { h: "2. How we use it", p: "To operate your account, process transactions, meet regulatory obligations, and improve the platform. We never sell your data to third parties." },
  { h: "3. How we protect it", p: "Data is encrypted at rest with AES-256 and in transit with TLS 1.3. Access is role-based and audited. Card details are handled by PCI-DSS certified processors and never stored on our servers." },
  { h: "4. Data sharing", p: "We share limited data with regulated custodians, KYC providers, and payment partners strictly to fulfil your instructions and comply with the law." },
  { h: "5. Your rights", p: "You may request access, correction or deletion of your personal data by writing to privacy@silverspoon.ng. Some records must be retained for regulatory periods." },
  { h: "6. Retention", p: "Account data is retained for the life of your account plus 7 years, as required by Nigerian financial regulations." },
  { h: "7. Contact", p: "For any privacy question, reach our Data Protection Officer at privacy@silverspoon.ng." },
];

function Privacy() {
  return (
    <PublicLayout>
      <article className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Legal</p>
        <h1 className="font-display mt-3 text-5xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 1 July 2026</p>
        <div className="mt-10 space-y-6 text-muted-foreground">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-display text-2xl text-foreground">{s.h}</h2>
              <p className="mt-2">{s.p}</p>
            </section>
          ))}
        </div>
      </article>
    </PublicLayout>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layouts/PublicLayout";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [
    { title: "Terms & Conditions — SILVER SPOON" },
    { name: "description", content: "The terms that govern your use of SILVER SPOON." },
  ]}),
  component: Terms,
});

function Terms() {
  return (
    <PublicLayout>
      <article className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Legal</p>
        <h1 className="font-display mt-3 text-5xl">Terms & Conditions</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 1 July 2026</p>

        <div className="prose prose-neutral dark:prose-invert mt-10 max-w-none space-y-6 text-muted-foreground">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-display text-2xl text-foreground">{s.h}</h2>
              <p>{s.p}</p>
            </section>
          ))}
        </div>
      </article>
    </PublicLayout>
  );
}

const sections = [
  { h: "1. Acceptance of terms", p: "By creating a SILVER SPOON account you agree to be bound by these Terms & Conditions and by our Privacy Policy. If you do not agree, please do not use the platform." },
  { h: "2. Eligibility", p: "You must be at least 18 years old, resident in Nigeria, and provide accurate personal information including a valid Bank Verification Number (BVN) to open an account." },
  { h: "3. Investment risk", p: "All investments carry risk. Historical returns are not indicative of future performance. You should only invest funds you can afford to keep committed for the stated plan duration." },
  { h: "4. Fees", p: "SILVER SPOON does not charge deposit or maintenance fees. Withdrawals above ₦10,000,000 attract a flat ₦2,500 wire fee. Third-party bank fees may apply." },
  { h: "5. Withdrawals", p: "Available balance withdrawals are honoured within 15 minutes on business days, subject to KYC checks. Locked plan balances mature at the end of the plan duration." },
  { h: "6. Termination", p: "We may suspend or terminate accounts that violate these terms, misuse the platform, or trigger AML flags. You may close your account at any time after settling active plans." },
  { h: "7. Governing law", p: "These terms are governed by the laws of the Federal Republic of Nigeria. Disputes will be resolved in the courts of Lagos State." },
];

import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { faqs } from "@/lib/mock-data";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/faq")({
  head: () => ({ meta: [
    { title: "FAQ — SILVER SPOON" },
    { name: "description", content: "Answers to the questions we hear most about SILVER SPOON." },
    { property: "og:title", content: "SILVER SPOON — FAQ" },
    { property: "og:description", content: "Regulation, fees, withdrawals, referrals — all your questions in one place." },
  ]}),
  component: Faq,
});

function Faq() {
  return (
    <PublicLayout>
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">FAQ</p>
          <h1 className="font-display mt-3 text-5xl sm:text-6xl">Frequently asked.</h1>
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`i${i}`} className="card-premium border-none px-6 py-1">
              <AccordionTrigger className="text-left font-medium hover:no-underline">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </PublicLayout>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import type { FormEvent } from "react";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [
    { title: "Contact — SILVER SPOON" },
    { name: "description", content: "Reach the SILVER SPOON team by email, phone or visit our Lagos office." },
    { property: "og:title", content: "Contact SILVER SPOON" },
    { property: "og:description", content: "Reach our concierge team by email, phone or visit our Lagos office." },
  ]}),
  component: Contact,
});

function Contact() {
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    toast.success("Message sent", { description: "We'll respond within 4 business hours." });
    (e.target as HTMLFormElement).reset();
  };

  return (
    <PublicLayout>
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Contact</p>
          <h1 className="font-display mt-3 text-5xl sm:text-6xl">We reply, personally.</h1>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:px-8">
        <div className="space-y-6">
          {[
            { icon: Mail, label: "Email", value: "concierge@silverspoon.ng" },
            { icon: Phone, label: "Phone", value: "+234 (0) 800 555 0142" },
            { icon: MapPin, label: "Head office", value: "12 Marina Avenue, Lagos Island" },
          ].map((c) => (
            <div key={c.label} className="card-premium flex items-start gap-4 p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-ink text-primary-foreground">
                <c.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">{c.label}</p>
                <p className="font-medium">{c.value}</p>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={onSubmit} className="card-premium space-y-4 p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><Input required placeholder="Ada Okafor" /></Field>
            <Field label="Email"><Input type="email" required placeholder="ada@example.com" /></Field>
          </div>
          <Field label="Subject"><Input required placeholder="How can we help?" /></Field>
          <Field label="Message"><Textarea required rows={6} placeholder="Tell us more…" /></Field>
          <Button type="submit" className="w-full rounded-full">Send message</Button>
        </form>
      </section>
    </PublicLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

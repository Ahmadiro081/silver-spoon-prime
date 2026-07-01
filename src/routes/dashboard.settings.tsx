import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { Moon, Sun, Monitor } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings — SILVER SPOON" }] }),
  component: Settings,
});

function Settings() {
  const { theme, setTheme } = useTheme();
  return (
    <DashboardLayout title="Settings">
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Appearance" desc="Customize how SILVER SPOON looks on your device.">
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "light", label: "Light", Icon: Sun },
              { v: "dark", label: "Dark", Icon: Moon },
              { v: "system", label: "System", Icon: Monitor },
            ].map(({ v, label, Icon }) => (
              <button
                key={v}
                onClick={() => setTheme(v as any)}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition ${theme === v ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}
              >
                <Icon className="h-5 w-5" /> {label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Notification preferences" desc="Choose what should reach your inbox.">
          <Toggle label="Email alerts" defaultChecked />
          <Toggle label="Push notifications" defaultChecked />
          <Toggle label="Product updates" />
          <Toggle label="Referral activity" defaultChecked />
        </Section>

        <Section title="Security" desc="Protect your capital with extra checks.">
          <Toggle label="Two-factor authentication" defaultChecked />
          <Toggle label="Withdrawal PIN" defaultChecked />
          <Toggle label="Login alerts" />
          <Button variant="outline" className="mt-2 w-full rounded-full" onClick={() => toast("Sessions cleared")}>Sign out of all sessions</Button>
        </Section>

        <Section title="Preferences" desc="Language, currency and localisation.">
          <FieldSelect label="Language" defaultValue="en-ng" options={[
            { v: "en-ng", l: "English (Nigeria)" }, { v: "en-uk", l: "English (UK)" }, { v: "fr", l: "Français" }, { v: "yo", l: "Yorùbá" },
          ]} />
          <FieldSelect label="Display currency" defaultValue="ngn" options={[{ v: "ngn", l: "Naira (₦)" }, { v: "usd", l: "US Dollar ($)" }]} />
          <FieldSelect label="Time zone" defaultValue="wat" options={[{ v: "wat", l: "West Africa Time (WAT)" }, { v: "utc", l: "UTC" }]} />
        </Section>
      </div>
    </DashboardLayout>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="card-premium p-6">
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function Toggle({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="font-normal">{label}</Label>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}

function FieldSelect({ label, defaultValue, options }: { label: string; defaultValue: string; options: { v: string; l: string }[] }) {
  return (
    <div className="grid grid-cols-2 items-center gap-3">
      <Label className="font-normal">{label}</Label>
      <Select defaultValue={defaultValue}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { AdminDashboardLayout } from "@/layouts/AdminDashboardLayout";
import { useAppState } from "@/context/AppStateContext";
import type { NotificationCategory } from "@/types/domain";
import { formatDateTime } from "@/utils/format";

export function AdminNotificationsPage() {
  const { users, notifications, adminSendNotification } = useAppState();
  const [recipient, setRecipient] = useState<string>("ALL");
  const [category, setCategory] = useState<NotificationCategory>("platform");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const investors = users.filter((u) => u.role === "investor");

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    const res = adminSendNotification({
      userId: recipient,
      title,
      message,
      category,
    });
    if (!res.ok) {
      toast.error(res.error ?? "Unable to send notification.");
      return;
    }
    toast.success("Notification dispatched and logged.");
    setTitle("");
    setMessage("");
  };

  return (
    <AdminDashboardLayout title="Client Notifications" breadcrumb="Notifications">
      <div className="grid gap-6 lg:grid-cols-12">
        <form onSubmit={handleSend} className="surface-card space-y-4 p-6 lg:col-span-5">
          <h2 className="font-display text-xl font-medium text-foreground">
            Dispatch Notification
          </h2>
          <p className="text-xs text-muted-foreground">
            Send a broadcast notice to all clients or message an individual investor inbox.
          </p>

          <div>
            <label htmlFor="ntf-rec" className="block text-xs font-medium text-foreground">
              Recipient
            </label>
            <select
              id="ntf-rec"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="ALL">All Registered Clients</option>
              {investors.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ntf-cat" className="block text-xs font-medium text-foreground">
              Category
            </label>
            <select
              id="ntf-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as NotificationCategory)}
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="platform">Platform Announcement</option>
              <option value="investment">Investment Mandate Notice</option>
              <option value="deposit">Treasury & Deposit Notice</option>
              <option value="withdrawal">Withdrawal Update</option>
              <option value="security">Security Advisory</option>
            </select>
          </div>

          <div>
            <label htmlFor="ntf-title" className="block text-xs font-medium text-foreground">
              Headline
            </label>
            <input
              id="ntf-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q4 Treasury Settlement Schedule"
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor="ntf-msg" className="block text-xs font-medium text-foreground">
              Message Body
            </label>
            <textarea
              id="ntf-msg"
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a concise update for client dashboards..."
              className="mt-1.5 w-full rounded-lg border border-input bg-background p-3 text-sm"
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Send className="h-3.5 w-3.5" />
            Send Notification
          </button>
        </form>

        <div className="surface-card overflow-hidden lg:col-span-7">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-lg font-medium text-foreground">
              Dispatched Notices ({notifications.length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {notifications.map((n) => (
              <div key={n.id} className="px-6 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">{n.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>Target: {n.userId === "ALL" ? "All Clients" : n.userId}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-tabular">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-foreground">{n.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{n.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminDashboardLayout>
  );
}

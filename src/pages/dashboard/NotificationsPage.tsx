import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { UserDashboardLayout } from "@/layouts/UserDashboardLayout";
import { EmptyState, SegmentedFilter } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";
import { formatDateTime } from "@/utils/format";

export function NotificationsPage() {
  const { userNotifications, markNotificationRead, markAllNotificationsRead } = useAppState();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = userNotifications.filter((n) => !n.read).length;
  const items = userNotifications.filter((n) => (filter === "unread" ? !n.read : true));

  const handleMarkAllRead = async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <UserDashboardLayout
      title="Notifications"
      breadcrumb="Notifications"
      action={
        <button
          type="button"
          onClick={() => {
            void handleMarkAllRead();
          }}
          disabled={unreadCount === 0 || markingAll}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground whitespace-nowrap hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {markingAll ? "Marking..." : "Mark All Read"}
        </button>
      }
    >
      <div className="space-y-5">
        <SegmentedFilter
          ariaLabel="Filter notifications"
          value={filter}
          onChange={setFilter}
          options={[
            { label: `All (${userNotifications.length})`, value: "all" },
            { label: `Unread (${unreadCount})`, value: "unread" },
          ]}
        />

        {items.length === 0 ? (
          <EmptyState
            title="All caught up"
            description="No unread alerts or settlement notices at this time."
            action={
              filter === "unread" && userNotifications.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="inline-flex h-9 items-center rounded-lg border border-border px-3.5 text-xs font-medium text-foreground hover:bg-secondary"
                >
                  Show All Notifications
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="surface-card divide-y divide-border overflow-hidden">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex flex-col justify-between gap-3 px-6 py-4 sm:flex-row sm:items-start ${
                  !item.read ? "bg-secondary/35" : ""
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{item.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-tabular">{formatDateTime(item.createdAt)}</span>
                    {!item.read && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-foreground">Unread</span>
                      </>
                    )}
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                </div>

                {!item.read && (
                  <button
                    type="button"
                    aria-label={`Mark "${item.title}" as read`}
                    onClick={() => {
                      void markNotificationRead(item.id);
                    }}
                    className="shrink-0 text-xs font-medium text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    Mark read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </UserDashboardLayout>
  );
}

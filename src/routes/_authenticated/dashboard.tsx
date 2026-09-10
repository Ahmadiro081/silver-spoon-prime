import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout wrapper for /dashboard/* — actual chrome is applied per-leaf via DashboardLayout
// so each page can set its own header title. This just renders the outlet.
export const Route = createFileRoute("/_authenticated/dashboard")({
  component: () => <Outlet />,
});

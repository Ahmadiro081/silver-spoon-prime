import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminRoute, InvestorRoute } from "@/components/auth/RouteGuards";
import { PageLoadingSkeleton } from "@/components/common/Primitives";
import { useAppState } from "@/context/AppStateContext";

// Public pages (lazy-loaded route chunks)
const HomePage = lazy(() =>
  import("@/pages/public/HomePage").then((m) => ({ default: m.HomePage })),
);
const AboutPage = lazy(() =>
  import("@/pages/public/AboutPage").then((m) => ({ default: m.AboutPage })),
);
const HowItWorksPage = lazy(() =>
  import("@/pages/public/HowItWorksPage").then((m) => ({ default: m.HowItWorksPage })),
);
const PlansPage = lazy(() =>
  import("@/pages/public/PlansPage").then((m) => ({ default: m.PlansPage })),
);
const FaqPage = lazy(() =>
  import("@/pages/public/FaqPage").then((m) => ({ default: m.FaqPage })),
);
const ContactPage = lazy(() =>
  import("@/pages/public/ContactPage").then((m) => ({ default: m.ContactPage })),
);
const TermsPage = lazy(() =>
  import("@/pages/public/TermsPage").then((m) => ({ default: m.TermsPage })),
);
const PrivacyPage = lazy(() =>
  import("@/pages/public/PrivacyPage").then((m) => ({ default: m.PrivacyPage })),
);

// Auth pages
const LoginPage = lazy(() =>
  import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import("@/pages/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);
const VerifyEmailPage = lazy(() =>
  import("@/pages/auth/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })),
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })),
);

// User Dashboard pages
const DashboardOverviewPage = lazy(() =>
  import("@/pages/dashboard/DashboardOverviewPage").then((m) => ({
    default: m.DashboardOverviewPage,
  })),
);
const WalletPage = lazy(() =>
  import("@/pages/dashboard/WalletPage").then((m) => ({ default: m.WalletPage })),
);
const InvestmentsPage = lazy(() =>
  import("@/pages/dashboard/InvestmentsPage").then((m) => ({ default: m.InvestmentsPage })),
);
const TransactionsPage = lazy(() =>
  import("@/pages/dashboard/TransactionsPage").then((m) => ({ default: m.TransactionsPage })),
);
const ReferralsPage = lazy(() =>
  import("@/pages/dashboard/ReferralsPage").then((m) => ({ default: m.ReferralsPage })),
);
const NotificationsPage = lazy(() =>
  import("@/pages/dashboard/NotificationsPage").then((m) => ({ default: m.NotificationsPage })),
);
const ProfilePage = lazy(() =>
  import("@/pages/dashboard/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/dashboard/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

// Admin Console pages
const AdminOverviewPage = lazy(() =>
  import("@/pages/admin/AdminOverviewPage").then((m) => ({ default: m.AdminOverviewPage })),
);
const AdminUsersPage = lazy(() =>
  import("@/pages/admin/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })),
);
const AdminPlansPage = lazy(() =>
  import("@/pages/admin/AdminPlansPage").then((m) => ({ default: m.AdminPlansPage })),
);
const AdminInvestmentsPage = lazy(() =>
  import("@/pages/admin/AdminInvestmentsPage").then((m) => ({ default: m.AdminInvestmentsPage })),
);
const AdminDepositsPage = lazy(() =>
  import("@/pages/admin/AdminDepositsPage").then((m) => ({ default: m.AdminDepositsPage })),
);
const AdminWithdrawalsPage = lazy(() =>
  import("@/pages/admin/AdminWithdrawalsPage").then((m) => ({ default: m.AdminWithdrawalsPage })),
);
const AdminTransactionsPage = lazy(() =>
  import("@/pages/admin/AdminTransactionsPage").then((m) => ({ default: m.AdminTransactionsPage })),
);
const AdminReferralsPage = lazy(() =>
  import("@/pages/admin/AdminReferralsPage").then((m) => ({ default: m.AdminReferralsPage })),
);
const AdminAnalyticsPage = lazy(() =>
  import("@/pages/admin/AdminAnalyticsPage").then((m) => ({ default: m.AdminAnalyticsPage })),
);
const AdminReportsPage = lazy(() =>
  import("@/pages/admin/AdminReportsPage").then((m) => ({ default: m.AdminReportsPage })),
);
const AdminNotificationsPage = lazy(() =>
  import("@/pages/admin/AdminNotificationsPage").then((m) => ({
    default: m.AdminNotificationsPage,
  })),
);
const AdminAuditLogsPage = lazy(() =>
  import("@/pages/admin/AdminAuditLogsPage").then((m) => ({ default: m.AdminAuditLogsPage })),
);
const AdminSettingsPage = lazy(() =>
  import("@/pages/admin/AdminSettingsPage").then((m) => ({ default: m.AdminSettingsPage })),
);

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

function NotFoundPage() {
  const { session, authenticatedUser } = useAppState();
  const workspacePath = !session.authenticated
    ? "/login"
    : authenticatedUser?.role === "admin"
      ? "/admin"
      : "/dashboard";
  const workspaceLabel = !session.authenticated
    ? "Sign In"
    : authenticatedUser?.role === "admin"
      ? "Admin Console"
      : "Open Dashboard";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="font-tabular text-xs font-medium text-muted-foreground">Error 404</p>
      <h1 className="font-display mt-3 text-4xl font-medium text-foreground">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The SILVER SPOON page you requested does not exist or has been reorganized.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          to="/"
          className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Return Home
        </Link>
        <Link
          to={workspacePath}
          className="inline-flex h-10 items-center rounded-lg border border-border px-5 text-sm font-medium text-foreground hover:bg-secondary"
        >
          {workspaceLabel}
        </Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<PageLoadingSkeleton />}>
        <Routes>
          {/* Public Website */}
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/investment-plans" element={<Navigate to="/plans" replace />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />

          {/* Authentication */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* User Dashboard (Investor-only guarded routes) */}
          <Route
            path="/dashboard"
            element={
              <InvestorRoute>
                <DashboardOverviewPage />
              </InvestorRoute>
            }
          />
          <Route
            path="/dashboard/wallet"
            element={
              <InvestorRoute>
                <WalletPage />
              </InvestorRoute>
            }
          />
          <Route
            path="/dashboard/investments"
            element={
              <InvestorRoute>
                <InvestmentsPage />
              </InvestorRoute>
            }
          />
          <Route
            path="/dashboard/transactions"
            element={
              <InvestorRoute>
                <TransactionsPage />
              </InvestorRoute>
            }
          />
          <Route
            path="/dashboard/referrals"
            element={
              <InvestorRoute>
                <ReferralsPage />
              </InvestorRoute>
            }
          />
          <Route
            path="/dashboard/notifications"
            element={
              <InvestorRoute>
                <NotificationsPage />
              </InvestorRoute>
            }
          />
          <Route
            path="/dashboard/profile"
            element={
              <InvestorRoute>
                <ProfilePage />
              </InvestorRoute>
            }
          />
          <Route
            path="/dashboard/settings"
            element={
              <InvestorRoute>
                <SettingsPage />
              </InvestorRoute>
            }
          />

          {/* Administrator Console (Admin-only guarded routes) */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminOverviewPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <AdminUsersPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/plans"
            element={
              <AdminRoute>
                <AdminPlansPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/investments"
            element={
              <AdminRoute>
                <AdminInvestmentsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/deposits"
            element={
              <AdminRoute>
                <AdminDepositsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/withdrawals"
            element={
              <AdminRoute>
                <AdminWithdrawalsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/transactions"
            element={
              <AdminRoute>
                <AdminTransactionsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/referrals"
            element={
              <AdminRoute>
                <AdminReferralsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <AdminRoute>
                <AdminAnalyticsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <AdminRoute>
                <AdminReportsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/notifications"
            element={
              <AdminRoute>
                <AdminNotificationsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/audit-logs"
            element={
              <AdminRoute>
                <AdminAuditLogsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <AdminRoute>
                <AdminSettingsPage />
              </AdminRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;

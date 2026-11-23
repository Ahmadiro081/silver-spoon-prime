import { useEffect } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";

// Public pages
import { HomePage } from "@/pages/public/HomePage";
import { AboutPage } from "@/pages/public/AboutPage";
import { HowItWorksPage } from "@/pages/public/HowItWorksPage";
import { PlansPage } from "@/pages/public/PlansPage";
import { FaqPage } from "@/pages/public/FaqPage";
import { ContactPage } from "@/pages/public/ContactPage";
import { TermsPage } from "@/pages/public/TermsPage";
import { PrivacyPage } from "@/pages/public/PrivacyPage";

// Auth pages
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";

// User Dashboard pages
import { DashboardOverviewPage } from "@/pages/dashboard/DashboardOverviewPage";
import { WalletPage } from "@/pages/dashboard/WalletPage";
import { InvestmentsPage } from "@/pages/dashboard/InvestmentsPage";
import { TransactionsPage } from "@/pages/dashboard/TransactionsPage";
import { ReferralsPage } from "@/pages/dashboard/ReferralsPage";
import { NotificationsPage } from "@/pages/dashboard/NotificationsPage";
import { ProfilePage } from "@/pages/dashboard/ProfilePage";
import { SettingsPage } from "@/pages/dashboard/SettingsPage";

// Admin Console pages
import { AdminOverviewPage } from "@/pages/admin/AdminOverviewPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { AdminPlansPage } from "@/pages/admin/AdminPlansPage";
import { AdminInvestmentsPage } from "@/pages/admin/AdminInvestmentsPage";
import { AdminDepositsPage } from "@/pages/admin/AdminDepositsPage";
import { AdminWithdrawalsPage } from "@/pages/admin/AdminWithdrawalsPage";
import { AdminTransactionsPage } from "@/pages/admin/AdminTransactionsPage";
import { AdminReferralsPage } from "@/pages/admin/AdminReferralsPage";
import { AdminAnalyticsPage } from "@/pages/admin/AdminAnalyticsPage";
import { AdminReportsPage } from "@/pages/admin/AdminReportsPage";
import { AdminNotificationsPage } from "@/pages/admin/AdminNotificationsPage";
import { AdminAuditLogsPage } from "@/pages/admin/AdminAuditLogsPage";
import { AdminSettingsPage } from "@/pages/admin/AdminSettingsPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

function NotFoundPage() {
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
          to="/dashboard"
          className="inline-flex h-10 items-center rounded-lg border border-border px-5 text-sm font-medium text-foreground hover:bg-secondary"
        >
          Open Dashboard
        </Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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

        {/* User Dashboard */}
        <Route path="/dashboard" element={<DashboardOverviewPage />} />
        <Route path="/dashboard/wallet" element={<WalletPage />} />
        <Route path="/dashboard/investments" element={<InvestmentsPage />} />
        <Route path="/dashboard/transactions" element={<TransactionsPage />} />
        <Route path="/dashboard/referrals" element={<ReferralsPage />} />
        <Route path="/dashboard/notifications" element={<NotificationsPage />} />
        <Route path="/dashboard/profile" element={<ProfilePage />} />
        <Route path="/dashboard/settings" element={<SettingsPage />} />

        {/* Administrator Dashboard */}
        <Route path="/admin" element={<AdminOverviewPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/plans" element={<AdminPlansPage />} />
        <Route path="/admin/investments" element={<AdminInvestmentsPage />} />
        <Route path="/admin/deposits" element={<AdminDepositsPage />} />
        <Route path="/admin/withdrawals" element={<AdminWithdrawalsPage />} />
        <Route path="/admin/transactions" element={<AdminTransactionsPage />} />
        <Route path="/admin/referrals" element={<AdminReferralsPage />} />
        <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
        <Route path="/admin/reports" element={<AdminReportsPage />} />
        <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
        <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />

        {/* Catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

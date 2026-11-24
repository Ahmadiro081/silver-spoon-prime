const ROUTE_TITLES: Record<string, string> = {
  "/": "SILVER SPOON — Nigeria's Private Wealth Platform",
  "/about": "About Us — SILVER SPOON",
  "/how-it-works": "How It Works — SILVER SPOON",
  "/plans": "Investment Plans — SILVER SPOON",
  "/faq": "Frequently Asked Questions — SILVER SPOON",
  "/contact": "Contact Desk — SILVER SPOON",
  "/terms": "Terms & Conditions — SILVER SPOON",
  "/privacy": "Privacy Policy — SILVER SPOON",
  "/login": "Sign In — SILVER SPOON",
  "/register": "Open Account — SILVER SPOON",
  "/forgot-password": "Password Recovery — SILVER SPOON",
  "/verify-email": "Verify Email — SILVER SPOON",
  "/reset-password": "Reset Password — SILVER SPOON",
  "/dashboard": "Portfolio Overview · Client Portal — SILVER SPOON",
  "/dashboard/wallet": "Wallet Management · Client Portal — SILVER SPOON",
  "/dashboard/investments": "Investments & Mandates · Client Portal — SILVER SPOON",
  "/dashboard/transactions": "Transaction Ledger · Client Portal — SILVER SPOON",
  "/dashboard/referrals": "Referral Program · Client Portal — SILVER SPOON",
  "/dashboard/notifications": "Notifications · Client Portal — SILVER SPOON",
  "/dashboard/profile": "Client Profile & KYC · Client Portal — SILVER SPOON",
  "/dashboard/settings": "Account Settings · Client Portal — SILVER SPOON",
  "/admin": "Platform Overview · Admin Console — SILVER SPOON",
  "/admin/users": "User Management · Admin Console — SILVER SPOON",
  "/admin/plans": "Investment Plans · Admin Console — SILVER SPOON",
  "/admin/investments": "Investment Management · Admin Console — SILVER SPOON",
  "/admin/deposits": "Deposit Records · Admin Console — SILVER SPOON",
  "/admin/withdrawals": "Withdrawal Records · Admin Console — SILVER SPOON",
  "/admin/transactions": "Transaction Monitoring · Admin Console — SILVER SPOON",
  "/admin/referrals": "Referral Management · Admin Console — SILVER SPOON",
  "/admin/analytics": "Financial Analytics · Admin Console — SILVER SPOON",
  "/admin/reports": "Financial Reports · Admin Console — SILVER SPOON",
  "/admin/notifications": "Client Notifications · Admin Console — SILVER SPOON",
  "/admin/audit-logs": "Audit Logs · Admin Console — SILVER SPOON",
  "/admin/settings": "Platform Settings · Admin Console — SILVER SPOON",
};

export function resolvePageTitle(pathname: string): string {
  const normalized = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  return ROUTE_TITLES[normalized] ?? "Page Not Found — SILVER SPOON";
}

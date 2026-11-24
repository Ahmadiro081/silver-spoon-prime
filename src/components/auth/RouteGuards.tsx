import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useAppState } from "@/context/AppStateContext";
import type { UserRole } from "@/types/domain";

function UnauthorizedRoleView({
  requiredRole,
  currentRole,
}: {
  requiredRole: UserRole;
  currentRole: UserRole;
}) {
  const navigate = useNavigate();
  const { logout } = useAppState();
  const isNeedAdmin = requiredRole === "admin";

  const handleReturnHomeWorkspace = () => {
    navigate(currentRole === "admin" ? "/admin" : "/dashboard", { replace: true });
  };

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="surface-card w-full max-w-lg p-8 text-center shadow-subtle">
        <div className="flex justify-center">
          <Logo to="/" />
        </div>
        <div className="mx-auto mt-6 grid h-12 w-12 place-items-center rounded-full border border-border bg-secondary">
          <ShieldAlert className="h-5 w-5 text-warning" aria-hidden="true" />
        </div>
        <p className="mt-4 text-xs font-medium text-muted-foreground">
          Role Separation Control · Access Restricted
        </p>
        <h1 className="font-display mt-2 text-2xl font-medium text-foreground">
          {isNeedAdmin ? "Administrator Access Required" : "Investor Workspace Isolation"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {isNeedAdmin
            ? "Your active session is signed in as an Investor. Operations, treasury approval queues, and platform governance controls are restricted to Administrator accounts."
            : "Your active session is signed in as an Administrator. To prevent mixing administrative credentials with client financial ledgers, sign in with an Investor account to open the Client Dashboard."}
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={handleReturnHomeWorkspace}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground whitespace-nowrap transition-colors hover:bg-primary/90"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {currentRole === "admin" ? "Return to Admin Console" : "Return to Client Dashboard"}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 text-xs font-medium text-foreground whitespace-nowrap transition-colors hover:bg-secondary"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign Out
          </button>
        </div>

        <p className="mt-6 border-t border-border pt-4 text-[11px] text-muted-foreground">
          Frontend route guards enforce role boundaries in this standalone test environment.
          Authoritative server-side RBAC is enforced upon backend integration.
        </p>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, authenticatedUser } = useAppState();
  const location = useLocation();

  if (!session.authenticated || !authenticatedUser) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <>{children}</>;
}

export function InvestorRoute({ children }: { children: ReactNode }) {
  const { authenticatedUser } = useAppState();

  return (
    <ProtectedRoute>
      {authenticatedUser && authenticatedUser.role !== "investor" ? (
        <UnauthorizedRoleView requiredRole="investor" currentRole={authenticatedUser.role} />
      ) : (
        children
      )}
    </ProtectedRoute>
  );
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { authenticatedUser } = useAppState();

  return (
    <ProtectedRoute>
      {authenticatedUser && authenticatedUser.role !== "admin" ? (
        <UnauthorizedRoleView requiredRole="admin" currentRole={authenticatedUser.role} />
      ) : (
        children
      )}
    </ProtectedRoute>
  );
}

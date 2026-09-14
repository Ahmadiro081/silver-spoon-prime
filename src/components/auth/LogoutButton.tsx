import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface LogoutButtonProps {
  variant?: "sidebar" | "menu" | "button";
  className?: string;
  onClick?: () => void;
}

export function LogoutButton({ variant = "button", className, onClick }: LogoutButtonProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } finally {
      setLoading(false);
    }
    onClick?.();
  };

  if (variant === "sidebar") {
    return (
      <button
        onClick={handleSignOut}
        disabled={loading}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
          "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
          className
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        <span className="truncate">{loading ? "Signing out…" : "Sign out"}</span>
      </button>
    );
  }

  if (variant === "menu") {
    return (
      <button
        onClick={handleSignOut}
        disabled={loading}
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
          "text-destructive focus:bg-destructive/10",
          className
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        <span>{loading ? "Signing out…" : "Sign out"}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors",
        "hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive",
        className
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      <span>{loading ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}

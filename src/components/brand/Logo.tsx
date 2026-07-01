import { Link } from "@tanstack/react-router";

export function Logo({ compact = false, invert = false }: { compact?: boolean; invert?: boolean }) {
  return (
    <Link to="/" className="group inline-flex items-center gap-2.5">
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-ink shadow-elegant">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
          <path
            d="M12 3c-3.5 0-5 2.2-5 4.5 0 2.2 1.8 3.5 3.5 4C9 12.2 7 13.5 7 16c0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.5-2-3.8-3.5-4.5 1.7-.5 3.5-1.8 3.5-4C17 5.2 15.5 3 12 3Z"
            stroke="oklch(0.94 0.012 250)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="16" r="1.3" fill="oklch(0.94 0.012 250)" />
        </svg>
      </span>
      {!compact && (
        <span className={`font-display text-lg tracking-tight ${invert ? "text-primary-foreground" : "text-foreground"}`}>
          SILVER<span className="font-medium text-muted-foreground"> SPOON</span>
        </span>
      )}
    </Link>
  );
}

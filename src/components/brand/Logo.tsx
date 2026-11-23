import { Link } from "react-router-dom";

interface LogoProps {
  to?: string;
  invert?: boolean;
  compact?: boolean;
}

export function Logo({ to = "/", invert = false, compact = false }: LogoProps) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
          invert
            ? "border-white/20 bg-white/10 text-white"
            : "border-border bg-primary text-primary-foreground"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
          <path
            d="M12 3.5c-2.7 0-4.5 1.8-4.5 4.2 0 2.1 1.6 3.7 3.6 4.2v7.8c0 .5.4.8.9.8s.9-.3.9-.8v-7.8c2-.5 3.6-2.1 3.6-4.2 0-2.4-1.8-4.2-4.5-4.2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="7.7" r="1.2" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span
          className={`font-display text-base font-semibold tracking-tight whitespace-nowrap ${
            invert ? "text-white" : "text-foreground"
          }`}
        >
          SILVER SPOON
        </span>
      )}
    </Link>
  );
}

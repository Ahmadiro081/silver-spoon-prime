import { APP_CONFIG } from "@/config/app";

const nairaWhole = new Intl.NumberFormat(APP_CONFIG.currency.locale, {
  style: "currency",
  currency: APP_CONFIG.currency.code,
  maximumFractionDigits: 0,
});

const nairaDecimals = new Intl.NumberFormat(APP_CONFIG.currency.locale, {
  style: "currency",
  currency: APP_CONFIG.currency.code,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNaira(amount: number, showDecimals = false): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return showDecimals ? nairaDecimals.format(safe) : nairaWhole.format(safe);
}

export function formatCompactNaira(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}₦${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}₦${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}₦${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₦${abs.toLocaleString("en-NG")}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-NG").format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function daysRemaining(maturesAt: string): number {
  const diff = new Date(maturesAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

export function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber || accountNumber.length < 4) return "••••";
  return `•••• ${accountNumber.slice(-4)}`;
}

export function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "SS"
  );
}

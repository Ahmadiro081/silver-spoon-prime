export const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export const NGN2 = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
});

export const formatNaira = (n: number) => NGN.format(n);
export const formatNaira2 = (n: number) => NGN2.format(n);
export const formatNumber = (n: number) => new Intl.NumberFormat("en-NG").format(n);

export const formatCompactNaira = (n: number) => {
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(2)}b`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}k`;
  return `₦${n}`;
};

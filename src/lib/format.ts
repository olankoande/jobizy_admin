export function formatMoney(cents: number | null | undefined, currency = "CAD") {
  const safeCents = cents ?? 0;
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(safeCents / 100);
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  return new Intl.NumberFormat("fr-CA", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value ?? 0);
}

export function formatPercent(value: number | null | undefined) {
  return `${formatNumber((value ?? 0) * 100, 1)} %`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function titleCaseStatus(value: string | null | undefined) {
  if (!value) {
    return "Inconnu";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

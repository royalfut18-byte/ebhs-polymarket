// Display helpers. Probabilities are 0..1 internally; we show them as ¢ / %.

/** 0.63 -> "63¢" */
export function toCents(prob: number): string {
  return `${Math.round(clamp01(prob) * 100)}¢`;
}

/** 0.63 -> "63%" */
export function toPercent(prob: number, digits = 0): string {
  return `${(clamp01(prob) * 100).toFixed(digits)}%`;
}

export function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Play-money amount, e.g. 1234.5 -> "1,234.50". */
export function formatCredits(n: number, digits = 2): string {
  if (n === null || n === undefined || isNaN(n)) return "0";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Play-money amount with the $ symbol, e.g. 1234.5 -> "$1,234.50". (Still fake money.) */
export function formatMoney(n: number, digits = 2): string {
  return `$${formatCredits(n, digits)}`;
}

/** Compact number, e.g. 12000 -> "12K". */
export function formatCompact(n: number): string {
  if (n === null || n === undefined || isNaN(n)) return "0";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatShares(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Relative time, e.g. "3m ago", "2h ago", "5d ago". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Initials for the fallback avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic color from a string (avatar backgrounds). */
export function colorFromString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

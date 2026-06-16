import type { MarketStatus, Outcome } from "@/lib/types";

const MAP: Record<MarketStatus, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-yes/15 text-yes-text" },
  closed: { label: "Closed", cls: "bg-yellow-500/15 text-yellow-300" },
  resolved: { label: "Resolved", cls: "bg-brand/15 text-brand" },
  cancelled: { label: "Cancelled", cls: "bg-no/15 text-no-text" },
};

export default function StatusBadge({
  status,
  resolution,
}: {
  status: MarketStatus;
  resolution?: Outcome | null;
}) {
  const info = MAP[status];
  const label =
    status === "resolved" && resolution ? `Resolved ${resolution.toUpperCase()}` : info.label;
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${info.cls}`}>{label}</span>
  );
}

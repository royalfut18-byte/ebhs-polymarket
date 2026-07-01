import type { MarketStatus, Outcome } from "@/lib/types";

const MAP: Record<MarketStatus, { label: string; dot: string; cls: string }> = {
  open: { label: "Open", dot: "bg-yes", cls: "border-yes/30 bg-yes/10 text-yes-text" },
  closed: { label: "Closed", dot: "bg-amber-400", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  resolved: { label: "Resolved", dot: "bg-brand-light", cls: "border-brand/35 bg-brand/12 text-brand-light" },
  cancelled: { label: "Cancelled", dot: "bg-no", cls: "border-no/30 bg-no/10 text-no-text" },
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
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${info.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
      {label}
    </span>
  );
}

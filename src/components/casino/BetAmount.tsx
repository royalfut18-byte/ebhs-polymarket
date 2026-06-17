"use client";

import { Coins } from "lucide-react";
import clsx from "clsx";

// Stake-style bet input: a $ field plus ½ / 2× / Max quick buttons.
export default function BetAmount({
  amount,
  setAmount,
  balance,
  disabled,
  label = "Bet amount",
}: {
  amount: number;
  setAmount: (n: number) => void;
  balance: number;
  disabled?: boolean;
  label?: string;
}) {
  const clamp = (n: number) => Math.max(0, Math.round(n * 100) / 100);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</label>
      <div className="flex items-stretch gap-1.5">
        <div className="relative flex-1">
          <Coins
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-yellow-300"
          />
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={Number.isFinite(amount) ? amount : 0}
            disabled={disabled}
            onChange={(e) => setAmount(clamp(parseFloat(e.target.value) || 0))}
            className="input pl-9 font-semibold tabular-nums"
          />
        </div>
        <QuickBtn disabled={disabled} onClick={() => setAmount(clamp(amount / 2))}>
          ½
        </QuickBtn>
        <QuickBtn disabled={disabled} onClick={() => setAmount(clamp(amount * 2))}>
          2×
        </QuickBtn>
        <QuickBtn disabled={disabled} onClick={() => setAmount(clamp(balance))}>
          Max
        </QuickBtn>
      </div>
    </div>
  );
}

function QuickBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded-xl border border-border bg-white/[0.03] px-3 text-sm font-semibold text-ink-dim transition-colors",
        "hover:border-border-soft hover:bg-white/[0.07] hover:text-ink disabled:opacity-50"
      )}
    >
      {children}
    </button>
  );
}

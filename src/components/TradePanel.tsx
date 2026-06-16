"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "@/lib/supabase/client";
import { priceYes, quoteTrade } from "@/lib/lmsr";
import { formatMoney, formatShares, toCents } from "@/lib/format";
import type { Market, Outcome, Position, TradeSide } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import clsx from "clsx";

export default function TradePanel({ market }: { market: Market }) {
  const { user, profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const supabase = getSupabase();

  const [outcome, setOutcome] = useState<Outcome>(
    searchParams.get("o") === "no" ? "no" : "yes"
  );
  const [side, setSide] = useState<TradeSide>("buy");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // The user's positions in *this* market (for sell mode + holdings display).
  const positionsQuery = useQuery({
    queryKey: ["market-positions", market.id, user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Position[]> => {
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .eq("market_id", market.id)
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data as Position[]) ?? [];
    },
  });

  const positions = positionsQuery.data ?? [];
  const heldYes = positions.find((p) => p.outcome === "yes");
  const heldNo = positions.find((p) => p.outcome === "no");
  const held = outcome === "yes" ? heldYes : heldNo;
  const heldShares = held?.shares ?? 0;

  const pYes = priceYes(market.q_yes, market.q_no, market.b);
  const pNo = 1 - pYes;
  const tradable = market.status === "open";

  useEffect(() => {
    setMsg(null);
  }, [outcome, side, amount]);

  const value = parseFloat(amount) || 0;
  const effectiveValue = side === "sell" ? Math.min(value, heldShares) : value;
  const quote = useMemo(
    () => quoteTrade(market, outcome, side, effectiveValue),
    [market, outcome, side, effectiveValue]
  );

  const balance = profile?.balance ?? 0;
  const insufficientFunds = side === "buy" && value > balance;
  const noShares = side === "sell" && heldShares <= 0;
  const oversell = side === "sell" && value > heldShares;
  const canSubmit =
    tradable && !!user && effectiveValue > 0 && !insufficientFunds && !submitting && !noShares;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("execute_trade", {
      p_market_id: market.id,
      p_outcome: outcome,
      p_side: side,
      p_value: effectiveValue,
    });
    setSubmitting(false);

    if (error) {
      setMsg({ kind: "err", text: error.message });
      return;
    }

    const result = data as { shares: number; cost: number };
    setMsg({
      kind: "ok",
      text:
        side === "buy"
          ? `Bought ${formatShares(result.shares)} ${outcome.toUpperCase()} shares for ${formatMoney(result.cost)}.`
          : `Sold ${formatShares(effectiveValue)} ${outcome.toUpperCase()} shares for ${formatMoney(result.cost)}.`,
    });
    setAmount("");
    await refreshProfile();
    invalidate();
  }

  function invalidate() {
    [
      ["market", market.id],
      ["trades", market.id],
      ["holders", market.id],
      ["market-positions", market.id, user?.id],
      ["portfolio-positions", user?.id],
      ["user-trades", user?.id],
      ["markets"],
      ["market-stats"],
      ["leaderboard"],
    ].forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  }

  const buyChips = [10, 50, 100, Math.floor(balance)];
  const sellPchips: [string, number][] = [
    ["25%", 0.25],
    ["50%", 0.5],
    ["Max", 1],
  ];

  return (
    <div className="card sticky top-20 flex flex-col gap-4 p-4">
      {/* Buy / Sell tabs */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg-soft p-1">
        {(["buy", "sell"] as TradeSide[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={clsx(
              "rounded-lg py-1.5 text-sm font-semibold capitalize transition-colors",
              side === s ? "bg-bg-hover text-ink" : "text-ink-faint hover:text-ink"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Outcome toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setOutcome("yes")}
          className={clsx(
            "flex flex-col items-center rounded-xl border py-2.5 transition-colors",
            outcome === "yes"
              ? "border-yes bg-yes/15"
              : "border-border bg-bg-soft hover:bg-bg-hover"
          )}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-ink-dim">Yes</span>
          <span className="text-lg font-bold text-yes-text">{toCents(pYes)}</span>
        </button>
        <button
          onClick={() => setOutcome("no")}
          className={clsx(
            "flex flex-col items-center rounded-xl border py-2.5 transition-colors",
            outcome === "no" ? "border-no bg-no/15" : "border-border bg-bg-soft hover:bg-bg-hover"
          )}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-ink-dim">No</span>
          <span className="text-lg font-bold text-no-text">{toCents(pNo)}</span>
        </button>
      </div>

      {!tradable ? (
        <div className="rounded-xl border border-border bg-bg-soft p-4 text-center text-sm text-ink-dim">
          <div className="mb-1">
            <StatusBadge status={market.status} resolution={market.resolution} />
          </div>
          Trading is closed for this market.
        </div>
      ) : !user ? (
        <Link href="/login" className="btn btn-primary w-full">
          Log in to trade
        </Link>
      ) : (
        <>
          {/* Amount input */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-ink-dim">
              <span>{side === "buy" ? "Amount ($)" : "Shares to sell"}</span>
              {side === "sell" && (
                <span>
                  You hold {formatShares(heldShares)} {outcome.toUpperCase()}
                </span>
              )}
            </div>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="input text-lg font-semibold"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {side === "buy"
                ? buyChips.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setAmount(String(c))}
                      disabled={c <= 0}
                      className="rounded-lg border border-border bg-bg-soft px-2.5 py-1 text-xs font-medium text-ink-dim hover:bg-bg-hover disabled:opacity-40"
                    >
                      {i === 3 ? "Max" : c}
                    </button>
                  ))
                : sellPchips.map(([label, pct]) => (
                    <button
                      key={label}
                      onClick={() => setAmount(String(+(heldShares * pct).toFixed(4)))}
                      disabled={heldShares <= 0}
                      className="rounded-lg border border-border bg-bg-soft px-2.5 py-1 text-xs font-medium text-ink-dim hover:bg-bg-hover disabled:opacity-40"
                    >
                      {label}
                    </button>
                  ))}
            </div>
          </div>

          {/* Quote summary */}
          <div className="flex flex-col gap-1.5 rounded-xl bg-bg-soft p-3 text-sm">
            <Row label="Avg price" value={toCents(quote.avgPrice)} />
            {side === "buy" ? (
              <>
                <Row label="Shares" value={formatShares(quote.shares)} />
                <Row
                  label="Potential payout"
                  value={formatMoney(quote.payout)}
                  hint={`if ${outcome.toUpperCase()} wins`}
                  accent
                />
              </>
            ) : (
              <Row label="You receive" value={formatMoney(quote.proceeds)} accent />
            )}
            <Row
              label="Price impact"
              value={`${toCents(quote.priceBefore)} → ${toCents(quote.priceAfter)}`}
              muted
            />
          </div>

          {/* Validation / result message */}
          {insufficientFunds && (
            <Notice kind="err">Insufficient balance — you have {formatMoney(balance)}.</Notice>
          )}
          {noShares && <Notice kind="err">You don&apos;t own any {outcome.toUpperCase()} shares.</Notice>}
          {oversell && !noShares && (
            <Notice kind="err">You only hold {formatShares(heldShares)} shares — selling the max.</Notice>
          )}
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

          <button
            onClick={submit}
            disabled={!canSubmit}
            className={clsx(
              "btn w-full",
              side === "buy"
                ? outcome === "yes"
                  ? "bg-yes text-white hover:bg-yes/90"
                  : "bg-no text-white hover:bg-no/90"
                : "btn-primary"
            )}
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {side === "buy" ? `Buy ${outcome.toUpperCase()}` : `Sell ${outcome.toUpperCase()}`}
          </button>

          {/* Holdings summary */}
          {(heldYes || heldNo) && (
            <div className="border-t border-border pt-3 text-xs text-ink-dim">
              <div className="mb-1 font-medium text-ink-faint">Your position</div>
              {heldYes && (
                <div className="flex justify-between">
                  <span className="text-yes-text">YES · {formatShares(heldYes.shares)} shares</span>
                  <span>avg {toCents(heldYes.avg_price)}</span>
                </div>
              )}
              {heldNo && (
                <div className="flex justify-between">
                  <span className="text-no-text">NO · {formatShares(heldNo.shares)} shares</span>
                  <span>avg {toCents(heldNo.avg_price)}</span>
                </div>
              )}
            </div>
          )}

          <div className="text-center text-xs text-ink-faint">
            Balance: {formatMoney(balance)} (play money)
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  accent,
  muted,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-dim">
        {label}
        {hint && <span className="ml-1 text-ink-faint">{hint}</span>}
      </span>
      <span
        className={clsx(
          "font-semibold",
          accent ? "text-yes-text" : muted ? "text-ink-faint" : "text-ink"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Notice({ kind, children }: { kind: "ok" | "err"; children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        "flex items-start gap-2 rounded-xl border p-2.5 text-xs",
        kind === "ok"
          ? "border-yes/30 bg-yes/10 text-yes-text"
          : "border-no/30 bg-no/10 text-no-text"
      )}
    >
      {kind === "ok" ? (
        <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
      ) : (
        <AlertCircle size={15} className="mt-0.5 shrink-0" />
      )}
      <span>{children}</span>
    </div>
  );
}

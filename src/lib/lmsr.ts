// Client-side mirror of the server LMSR math (supabase/migrations/0001_init.sql).
//
// Used purely for instant UI feedback — current prices on cards and the live
// trade preview. The server ALWAYS recomputes authoritatively inside
// execute_trade(); nothing here can move money or change a price for real.
//
// Logarithmic Market Scoring Rule (binary YES/NO):
//   Cost:    C(qy, qn) = b * ln( e^(qy/b) + e^(qn/b) )
//   P_yes:   e^(qy/b) / ( e^(qy/b) + e^(qn/b) )   (a probability in 0..1)
//   P_no:    1 - P_yes

import type { Market, Outcome, TradeSide } from "./types";

const CLAMP = 40; // keeps exp() away from overflow at the extremes

/** YES price (implied probability) in 0..1, numerically stable. */
export function priceYes(qYes: number, qNo: number, b: number): number {
  if (!b || b <= 0) return 0.5;
  let z = (qNo - qYes) / b;
  if (z > CLAMP) z = CLAMP;
  if (z < -CLAMP) z = -CLAMP;
  return 1 / (1 + Math.exp(z));
}

export function priceNo(qYes: number, qNo: number, b: number): number {
  return 1 - priceYes(qYes, qNo, b);
}

/** Price of a given outcome in 0..1. */
export function priceOf(outcome: Outcome, qYes: number, qNo: number, b: number): number {
  return outcome === "yes" ? priceYes(qYes, qNo, b) : priceNo(qYes, qNo, b);
}

/** Display YES price: a resolved market shows 100¢ (yes) or 0¢ (no); else live price. */
export function displayPriceYes(
  market: Pick<Market, "status" | "resolution" | "q_yes" | "q_no" | "b">
): number {
  if (market.status === "resolved") {
    if (market.resolution === "yes") return 1;
    if (market.resolution === "no") return 0;
  }
  return priceYes(market.q_yes, market.q_no, market.b);
}

/** Display price for a given outcome, accounting for resolution. */
export function displayPriceOf(
  outcome: Outcome,
  market: Pick<Market, "status" | "resolution" | "q_yes" | "q_no" | "b">
): number {
  const y = displayPriceYes(market);
  return outcome === "yes" ? y : 1 - y;
}

/** True when a market can no longer take trades (closed, settled, or past close_at). */
export function isClosedForTrading(market: Pick<Market, "status" | "close_at">): boolean {
  if (market.status !== "open") return true;
  if (market.close_at && new Date(market.close_at).getTime() <= Date.now()) return true;
  return false;
}

/** Stable LMSR cost via the log-sum-exp trick. */
export function cost(qYes: number, qNo: number, b: number): number {
  if (b <= 0) return 0;
  const m = Math.max(qYes, qNo);
  return m + b * Math.log(Math.exp((qYes - m) / b) + Math.exp((qNo - m) / b));
}

export interface Quote {
  shares: number; // shares bought (buy) or sold (sell)
  cost: number; // credits spent (buy)
  proceeds: number; // credits received (sell)
  avgPrice: number; // per-share price actually paid/received (0..1)
  priceBefore: number; // YES prob before
  priceAfter: number; // YES prob after
  payout: number; // max payout if this outcome wins (= shares)
}

const EMPTY = (p: number): Quote => ({
  shares: 0,
  cost: 0,
  proceeds: 0,
  avgPrice: p,
  priceBefore: p,
  priceAfter: p,
  payout: 0,
});

/**
 * Preview a trade.
 *  - BUY:  `value` = credits to spend  -> returns the shares received
 *  - SELL: `value` = number of shares  -> returns the proceeds
 */
export function quoteTrade(
  market: Pick<Market, "q_yes" | "q_no" | "b">,
  outcome: Outcome,
  side: TradeSide,
  value: number
): Quote {
  const { q_yes: qy, q_no: qn, b } = market;
  const priceBefore = priceYes(qy, qn, b);
  if (!value || value <= 0 || !isFinite(value)) return EMPTY(priceBefore);

  const c0 = cost(qy, qn, b);

  if (side === "buy") {
    const spend = value;
    const target = c0 + spend;
    let newQy = qy;
    let newQno = qn;
    let shares: number;
    if (outcome === "yes") {
      newQy = target + b * Math.log(1 - Math.exp((qn - target) / b));
      shares = newQy - qy;
    } else {
      newQno = target + b * Math.log(1 - Math.exp((qy - target) / b));
      shares = newQno - qn;
    }
    const priceAfter = priceYes(newQy, newQno, b);
    return {
      shares,
      cost: spend,
      proceeds: 0,
      avgPrice: shares > 0 ? spend / shares : priceBefore,
      priceBefore,
      priceAfter,
      payout: shares,
    };
  }

  // sell
  const shares = value;
  const newQy = outcome === "yes" ? qy - shares : qy;
  const newQno = outcome === "no" ? qn - shares : qn;
  let proceeds = c0 - cost(newQy, newQno, b);
  if (proceeds < 0) proceeds = 0;
  const priceAfter = priceYes(newQy, newQno, b);
  return {
    shares,
    cost: 0,
    proceeds,
    avgPrice: shares > 0 ? proceeds / shares : priceBefore,
    priceBefore,
    priceAfter,
    payout: 0,
  };
}

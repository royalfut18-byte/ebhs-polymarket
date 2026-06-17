// Profit/loss helpers (all play money).
//
//   per-position P/L = shares × current price − shares × avg buy price
//   total P/L        = net worth − starting stake ($1,000)
//                    = (cash + open-position value) − 1000
//
// Because winnings from resolved markets land back in the cash balance, the
// "net worth − starting stake" figure captures realized AND unrealized P/L.

import { displayPriceOf } from "./lmsr";
import type { Market, PositionWithMarket } from "./types";

export const STARTING_BALANCE = 1000;

export interface EnrichedPosition {
  p: PositionWithMarket;
  m: Market;
  price: number; // current price of the held outcome (0..1)
  value: number; // shares × price
  basis: number; // shares × avg_price
  pnl: number; // value − basis
  pnlPct: number; // pnl / basis
}

export function enrichPositions(positions: PositionWithMarket[]): EnrichedPosition[] {
  return positions
    .filter((p): p is PositionWithMarket & { markets: Market } => !!p.markets)
    .map((p) => {
      const m = p.markets as Market;
      const price = displayPriceOf(p.outcome, m);
      const value = p.shares * price;
      const basis = p.shares * p.avg_price;
      const pnl = value - basis;
      const pnlPct = basis > 0 ? (pnl / basis) * 100 : 0;
      return { p, m, price, value, basis, pnl, pnlPct };
    })
    .sort((a, b) => b.value - a.value);
}

export interface PortfolioSummary {
  positionsValue: number;
  basis: number;
  openPnl: number;
  netWorth: number;
  totalPnl: number;
  totalPct: number;
}

export function summarize(
  enriched: EnrichedPosition[],
  balance: number,
  starting = STARTING_BALANCE
): PortfolioSummary {
  const positionsValue = enriched.reduce((s, e) => s + e.value, 0);
  const basis = enriched.reduce((s, e) => s + e.basis, 0);
  const openPnl = positionsValue - basis;
  const netWorth = balance + positionsValue;
  const totalPnl = netWorth - starting;
  const totalPct = starting > 0 ? (totalPnl / starting) * 100 : 0;
  return { positionsValue, basis, openPnl, netWorth, totalPnl, totalPct };
}

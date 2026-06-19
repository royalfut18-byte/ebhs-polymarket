// One-off generator for Plinko paytables (rows 8..16 × low/medium/high).
// Produces symmetric U-shaped multiplier tables with a verified house edge,
// capped at 1000×. The printed output is pasted verbatim into BOTH
// supabase/migrations/0016_plinko.sql and src/lib/casino/plinko.ts so the
// server payout and the client display can never drift apart.

function binomial(n) {
  // probabilities p_k = C(n,k) / 2^n for k = 0..n
  const c = [1];
  for (let i = 1; i <= n; i++) {
    c[i] = (c[i - 1] * (n - i + 1)) / i;
  }
  const denom = 2 ** n;
  return c.map((x) => x / denom);
}

// Rounding that looks like Stake: <10 -> 1 dp, <100 -> whole-ish, else integer.
function pretty(v) {
  if (v >= 100) return Math.round(v);
  if (v >= 10) return Math.round(v * 10) / 10;
  return Math.round(v * 10) / 10; // 0.1 steps for small values
}

const ALPHA = { low: 0.42, medium: 0.72, high: 1.05 };
const CAP = 1000;
const TARGET = 0.96; // pre-rounding return; keeps post-rounding RTP safely < 1

function table(n, risk) {
  const probs = binomial(n);
  const alpha = ALPHA[risk];
  const center = n / 2;
  const raw = [];
  for (let k = 0; k <= n; k++) raw[k] = Math.exp(alpha * Math.abs(k - center));
  let exp = 0;
  for (let k = 0; k <= n; k++) exp += probs[k] * raw[k];
  const lambda = TARGET / exp;
  let mult = raw.map((r) => Math.min(CAP, pretty(lambda * r)));
  // enforce exact symmetry (rounding can break it on the odd middle)
  for (let k = 0; k < mult.length; k++) {
    const j = n - k;
    const m = Math.max(mult[k], mult[j]);
    mult[k] = m;
    mult[j] = m;
  }
  let rtp = 0;
  for (let k = 0; k <= n; k++) rtp += probs[k] * mult[k];
  return { mult, rtp };
}

const out = {};
for (const risk of ["low", "medium", "high"]) {
  out[risk] = {};
  for (let n = 8; n <= 16; n++) {
    const { mult, rtp } = table(n, risk);
    out[risk][n] = mult;
    console.error(`${risk}\t${n} rows\tRTP=${(rtp * 100).toFixed(2)}%\tmax=${Math.max(...mult)}`);
  }
}

// TS literal
console.log("// ---- TS (src/lib/casino/plinko.ts) ----");
console.log("export const PLINKO_TABLES: Record<PlinkoRisk, Record<number, number[]>> = {");
for (const risk of ["low", "medium", "high"]) {
  console.log(`  ${risk}: {`);
  for (let n = 8; n <= 16; n++) console.log(`    ${n}: [${out[risk][n].join(", ")}],`);
  console.log(`  },`);
}
console.log("};");

// SQL JSONB literal
console.log("\n-- ---- SQL (jsonb) ----");
const sql = {};
for (const risk of ["low", "medium", "high"]) {
  sql[risk] = {};
  for (let n = 8; n <= 16; n++) sql[risk][n] = out[risk][n];
}
console.log(JSON.stringify(sql));

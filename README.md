# EBHS Polymarket 🎲

A pixel-faithful **play-money** prediction market for EBHS — a Polymarket-style game
where students bet **fake credits** on YES/NO questions. Prices behave like the real
thing (each outcome trades at 0–100¢ = its implied probability), markets are resolved
by admins, and winners get paid out.

> **There is no real money, crypto, or wallet anywhere in this app.** Every "credit"
> is fake. New users start with **1,000 play credits**.

Built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase**
(Postgres, Auth, Row Level Security, and Postgres RPC functions). Prices use the
**Logarithmic Market Scoring Rule (LMSR)**, computed entirely server-side.

---

## ✨ Features

- **Home grid** of market cards — big YES %, live prices, volume + traders, quick Buy buttons.
- **Market detail** — interactive price-over-time chart (Recharts), buy/sell trade panel
  with live share/payout preview, activity feed, top holders, and comments.
- **Portfolio** — open positions, mark-to-market value, profit/loss, and trade history.
- **Leaderboard** — everyone ranked by total play-money net worth.
- **Auth** — username + password (no email needed).
- **Roles** — `admin`, `subadmin`, `user` with an **admin panel** to create, edit,
  resolve and cancel markets, manage balances, and promote/demote sub-admins.
- **LMSR pricing** with an **initial-odds slider** so admins set the starting probability.

---

## 🚀 Quick start

### 0. Prerequisites
- Node.js 18.17+ (tested on Node 20)
- A free [Supabase](https://supabase.com) project

### 1. Install dependencies
```bash
npm install
```

### 2. Create the database
In the **Supabase dashboard → SQL Editor**, paste and run the entire contents of:

```
supabase/migrations/0001_init.sql
```

This one file creates **everything**: enums, tables, the new-user trigger, the
profile-protection trigger, Row Level Security policies, the LMSR pricing helpers,
the buy/sell/resolve/admin RPC functions, and the leaderboard + stats views.
It is safe to re-run.

> Using the Supabase CLI instead? `supabase db push` will pick up the migration.

### 3. Add your environment variables
Copy `.env.example` to `.env.local` and fill in your project's keys
(**Supabase dashboard → Project Settings → API**):

```bash
cp .env.example .env.local
```

```ini
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server-only, keep secret
NEXT_PUBLIC_EMAIL_DOMAIN=ebhs.local
```

| Variable | Where it's used | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser (RLS protects data) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Seed script + signup API only | **Yes** |
| `NEXT_PUBLIC_EMAIL_DOMAIN` | Maps `username → username@domain` | No |

### 4. Seed the admin + sample markets
```bash
npm run seed
```

This creates the default admin and a handful of fun EBHS sample markets:

| | |
| --- | --- |
| **Username** | `ashaz` |
| **Password** | `12345678` |
| **Role** | `admin` |

> ⚠️ `12345678` is a **default/dev password** — change it for any real use.

### 5. Run it
```bash
npm run dev
```

Open **http://localhost:3000**, log in as `ashaz` / `12345678`, or sign up as a new
user to get 1,000 play credits.

---

## 🔐 Auth & roles

Supabase Auth is email-based, so usernames are mapped to an internal email
(`username@ebhs.local`). You always log in with just a **username + password**.

Signups go through a server-side route (`/api/signup`) that uses the service-role
key to create an **already-confirmed** user — so no confirmation email is ever needed,
and you don't have to change any Supabase Auth email settings.

| Role | Can do |
| --- | --- |
| **admin** | Everything: create/edit/resolve/cancel markets, adjust balances, **create/remove sub-admins**, change roles. |
| **subadmin** | Create, edit, and **resolve** markets. Cannot manage users, balances, or other sub-admins. |
| **user** | Browse, trade, view portfolio + leaderboard. New users start at 1,000 credits. |

Gating is enforced **twice**: the UI hides controls by role, and — the part that
actually matters — every mutation runs through a `SECURITY DEFINER` Postgres function
that re-checks the caller's role. RLS makes all market/trade data world-readable but
blocks direct writes, so the client can never move money or change a price itself.

---

## 📈 How the pricing works (LMSR)

Each binary market keeps three numbers: a liquidity parameter `b` and two outcome
quantities `q_yes`, `q_no`.

```
Cost function:   C(q_yes, q_no) = b · ln( e^(q_yes/b) + e^(q_no/b) )
Price of YES:    P_yes = e^(q_yes/b) / ( e^(q_yes/b) + e^(q_no/b) )      ∈ (0, 1)
Price of NO:     P_no  = 1 − P_yes
Cost to buy Δ:   C(q_yes + Δ, q_no) − C(q_yes, q_no)
```

- Prices are probabilities, shown as **¢ / %**. **`P_yes + P_no` is always exactly 1.**
- **Buying YES raises the YES price** (and lowers NO); buying NO does the reverse.
- **Selling** is just a buy with negative Δ — you sell shares back along the curve.
- **Initial odds:** an admin's slider sets a starting probability `p`. The market is
  initialised with `q_no = 0` and `q_yes = b · ln(p / (1−p))`, which makes `P_yes = p`.
- **Higher `b`** = deeper liquidity = prices move less per trade.

The trade panel buys by **amount of credits**: it inverts the cost function to find how
many shares your credits buy. **Resolution** pays winners **1 credit per winning share**;
losing shares pay 0. **Cancellation** refunds everyone their cost basis. All of this
happens inside a single locked transaction in `execute_trade()` / `resolve_market()` —
the client never computes a price or a balance for real.

A client-side mirror of the same math (`src/lib/lmsr.ts`) powers the instant card prices
and the live trade preview, but the server is always the source of truth.

---

## 🗂️ Project structure

```
supabase/migrations/0001_init.sql   # the entire database (schema, RLS, RPCs, views)
scripts/seed.mjs                     # creates admin "ashaz" + sample markets
src/
  app/
    layout.tsx                       # nav + providers shell
    page.tsx                         # home (market grid + search + categories)
    market/[id]/page.tsx             # market detail (chart, trade panel, feed)
    portfolio/page.tsx               # positions + P/L + history
    leaderboard/page.tsx             # net-worth ranking
    login / signup                   # username + password
    admin/page.tsx                   # admin/subadmin dashboard (4 tabs)
    api/signup/route.ts              # server-side, confirmed-user signup
  components/                        # Navbar, MarketCard, TradePanel, PriceChart, …
    admin/                           # CreateMarketForm, ManageMarkets, ManageUsers, ManageSubadmins
  lib/
    lmsr.ts                          # client-side LMSR mirror
    queries.ts                       # Supabase data fetching
    supabase/{client,admin}.ts       # browser (anon) + server (service-role) clients
    types.ts  format.ts  categories.ts
```

---

## ✅ Acceptance checklist

- [x] `npm install && npm run dev` works once your Supabase keys are in `.env.local`.
- [x] A single SQL file creates all tables, enums, the new-user trigger, RLS policies, and the buy/sell + resolve RPC functions.
- [x] `npm run seed` creates admin `ashaz` / `12345678`.
- [x] Sign up → 1,000 credits → buy YES → price rises, balance drops.
- [x] `P_yes + P_no = 1`, always within 0–100¢.
- [x] Admin creates a market with the initial-odds slider, resolves it, winners get paid.
- [x] Admin promotes a user to sub-admin; that sub-admin can create/resolve markets but can't manage other sub-admins.
- [x] Polymarket-style dark UI: market cards, green/red YES/NO, live price chart.
- [x] **Fake currency only** — no real payments, crypto, or wallets.

---

## 🧯 Troubleshooting

- **"Supabase isn't configured" banner** — `.env.local` is missing/empty. Add your keys and restart `npm run dev`.
- **Markets won't load / RPC errors** — make sure you ran `supabase/migrations/0001_init.sql` on the project your keys point to.
- **`npm run seed` fails** — it needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and the migration to have been run first.
- **Login fails for a brand-new signup** — signups create confirmed users via the service role; confirm `SUPABASE_SERVICE_ROLE_KEY` is set.
- **Env changes not taking effect** — Next.js only reads `.env.local` at startup; restart the dev server.

---

*Built for fun at EBHS. Play money only — please don't bet your lunch money. 🍕*

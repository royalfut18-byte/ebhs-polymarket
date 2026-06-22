-- ============================================================================
-- EBHS Polymarket — migration 0025: SIGN-UP IP THROTTLE
--
-- A bot was hammering the signup endpoint to mass-create accounts. We now record
-- every signup attempt by client IP and the /api/signup route refuses a new one
-- when that IP already created an account in the last hour (or has made too many
-- attempts in that window). Only the server's SERVICE ROLE touches this table
-- (RLS on, no policies → anon/authenticated can't read or write it).
--
-- Run in the Supabase SQL editor on top of 0001–0024. Re-runnable.
-- ============================================================================

create table if not exists public.signup_attempts (
  id         bigint generated always as identity primary key,
  ip         text not null,
  username   text,
  success    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_signup_attempts_ip_time
  on public.signup_attempts (ip, created_at desc);

alter table public.signup_attempts enable row level security;

-- No policies on purpose: the service-role key (used only by /api/signup)
-- bypasses RLS, while anon/authenticated clients get nothing.
revoke all on public.signup_attempts from anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0025.
-- ============================================================================

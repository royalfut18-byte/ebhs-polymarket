-- ============================================================================
-- EBHS Polymarket — migration 0022: ARENA UNO (server-authoritative, N-player)
--
-- Uno differs from chess in two critical ways:
--   1. HIDDEN HANDS. If a hand lived anywhere the client could read, opponents
--      could pull it from the network tab. So Uno is FULLY server-authoritative:
--      the deck, every hand, and ALL rule-checking live in Postgres. A client can
--      only ever see its OWN cards (arena_uno_hands has a user_id = auth.uid()
--      select policy) and a safe public snapshot via uno_view(). The draw pile
--      lives in arena_uno_state, which has NO client select policy at all.
--   2. N PLAYERS via an OPEN LOBBY. Chess uses 1-v-1 challenges; Uno uses tables
--      a host opens and others join (status 'lobby'), each paying the stake on
--      join. Host starts when >= 2 have joined.
--
-- Money model is unchanged: stakes are escrowed (behind app.privileged), the pot
-- is the sum of stakes, and the FIRST player to empty their hand takes the whole
-- pot via the existing _arena_finish_win(). Voids refund everyone.
--
-- House rules: standard play + STACKING (+2 on +2, +4 on +4 — the next player
-- either adds to the stack or draws the accumulated total and is skipped).
-- Normal draw is "draw one and pass" (a clean, fair simplification). Max 8 seats.
--
-- ALL CURRENCY IS FAKE PLAY MONEY. No real money, crypto or wallets. Real names
-- are never exposed — uno_view returns usernames only.
--
-- Run in the Supabase SQL editor on top of 0001–0021. Re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema additions
-- ---------------------------------------------------------------------------

-- Allow the 'lobby' state (tables waiting for players before they start).
alter table public.arena_matches drop constraint if exists arena_matches_status_check;
alter table public.arena_matches
  add constraint arena_matches_status_check
  check (status in ('lobby', 'active', 'finished', 'void'));

alter table public.arena_matches add column if not exists max_players int not null default 8;

-- Each player's secret hand. RLS: you can read ONLY your own row.
create table if not exists public.arena_uno_hands (
  match_id uuid not null references public.arena_matches(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  cards    jsonb not null default '[]'::jsonb,
  primary key (match_id, user_id)
);

-- The table state: secret draw pile + public pointers. NO client select policy —
-- clients read everything they're allowed to see through uno_view() instead.
create table if not exists public.arena_uno_state (
  match_id       uuid primary key references public.arena_matches(id) on delete cascade,
  draw_pile      jsonb not null default '[]'::jsonb,
  discard        jsonb not null default '[]'::jsonb,   -- top = last element
  color          text  not null default 'r',           -- active color (r/y/g/b)
  current_seat   int   not null default 0,
  direction      int   not null default 1,             -- 1 or -1
  pending_draw   int   not null default 0,             -- accumulated +2/+4 stack
  pending_type   text,                                  -- null | 'draw2' | 'wild4'
  player_count   int   not null default 0,
  left_seats     jsonb not null default '[]'::jsonb,    -- seats that forfeited
  log            jsonb not null default '[]'::jsonb,    -- recent actions feed
  last_action_at timestamptz not null default now()
);

alter table public.arena_uno_hands enable row level security;
alter table public.arena_uno_state enable row level security;

-- Own hand only. No insert/update/delete policies: only the SECURITY DEFINER
-- RPCs (which run as owner and bypass RLS) ever mutate hands.
drop policy if exists arena_uno_hands_sel on public.arena_uno_hands;
create policy arena_uno_hands_sel on public.arena_uno_hands
  for select using (user_id = auth.uid());

-- arena_uno_state intentionally has NO policies → clients cannot read it at all.

grant select on public.arena_uno_hands to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pure helpers (deck, slicing, turn rotation, log tail)
-- ---------------------------------------------------------------------------

-- A freshly shuffled 108-card deck. Cards are {c,v}: colour r/y/g/b (w for
-- wilds), value '0'..'9' | 'skip' | 'rev' | 'draw2' | 'wild' | 'wild4'.
create or replace function public._uno_deck()
returns jsonb
language sql
as $$
  with colors as (select unnest(array['r','y','g','b']) as c),
  nums as (
    select c, v from colors,
      (select '0'::text as v
       union all select g::text from generate_series(1, 9) g
       union all select g::text from generate_series(1, 9) g) z
  ),
  actions as (
    select c, v from colors,
      (select unnest(array['skip','skip','rev','rev','draw2','draw2']) as v) z
  ),
  wilds as (
    select 'w'::text as c, v from
      (select unnest(array['wild','wild','wild','wild','wild4','wild4','wild4','wild4']) as v) z
  ),
  all_cards as (
    select c, v from nums
    union all select c, v from actions
    union all select c, v from wilds
  )
  select coalesce(jsonb_agg(jsonb_build_object('c', c, 'v', v) order by random()), '[]'::jsonb)
  from all_cards;
$$;

-- Take the first p_n cards off a pile; returns {taken, rest}.
create or replace function public._uno_take(p_pile jsonb, p_n int)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'taken', coalesce((select jsonb_agg(e order by ord)
                       from jsonb_array_elements(p_pile) with ordinality t(e, ord)
                       where ord <= p_n), '[]'::jsonb),
    'rest',  coalesce((select jsonb_agg(e order by ord)
                       from jsonb_array_elements(p_pile) with ordinality t(e, ord)
                       where ord >  p_n), '[]'::jsonb)
  );
$$;

-- Keep only the last p_n elements of an array (for the action log).
create or replace function public._uno_tail(p jsonb, p_n int)
returns jsonb
language sql
as $$
  with arr as (
    select e, ord, count(*) over () as c
    from jsonb_array_elements(p) with ordinality t(e, ord)
  )
  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) from arr where ord > c - p_n;
$$;

-- Advance p_steps ACTIVE seats from p_current in direction p_dir, skipping any
-- seat that has left the game.
create or replace function public._uno_next_seat(p_count int, p_current int, p_dir int, p_left jsonb, p_steps int)
returns int
language plpgsql
as $$
declare
  s int := p_current;
  moved int := 0;
  guard int := 0;
begin
  if p_count <= 0 then return p_current; end if;
  while moved < p_steps and guard < 10000 loop
    guard := guard + 1;
    s := ((s + p_dir) % p_count + p_count) % p_count;
    if not exists (select 1 from jsonb_array_elements_text(p_left) le where le::int = s) then
      moved := moved + 1;
    end if;
  end loop;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Lobby: create / list / join / leave
-- ---------------------------------------------------------------------------

create or replace function public.uno_create(p_stake numeric, p_max int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match uuid;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_stake is null or p_stake <= 0 then raise exception 'Stake must be greater than zero.'; end if;
  if p_stake > 1000000 then raise exception 'Stake is too large.'; end if;
  if p_max is null or p_max < 2 or p_max > 8 then raise exception 'Table size must be 2–8.'; end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_stake where id = v_uid and balance >= p_stake;
  if not found then raise exception 'Insufficient balance.'; end if;

  insert into public.arena_matches (game, status, stake, pot, max_players, state)
  values ('uno', 'lobby', p_stake, p_stake, p_max, '{}'::jsonb)
  returning id into v_match;

  insert into public.arena_match_players (match_id, user_id, seat, stake)
  values (v_match, v_uid, 0, p_stake);

  return json_build_object('match_id', v_match);
end;
$$;

-- Open tables anyone can join. SECURITY DEFINER so non-members can see lobbies
-- they haven't joined yet (exposes only non-sensitive table info + host handle).
create or replace function public.uno_open_tables()
returns json
language sql
security definer
set search_path = public
as $$
  select coalesce(json_agg(t order by t.created_at desc), '[]'::json)
  from (
    select
      m.id as match_id,
      m.stake,
      m.max_players,
      m.created_at,
      (select count(*) from public.arena_match_players p where p.match_id = m.id) as joined,
      host.user_id as host_id,
      hp.username as host_username
    from public.arena_matches m
    left join lateral (
      select user_id from public.arena_match_players p
      where p.match_id = m.id order by seat limit 1
    ) host on true
    left join public.profiles hp on hp.id = host.user_id
    where m.game = 'uno' and m.status = 'lobby'
  ) t;
$$;

create or replace function public.uno_join(p_match uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  v_count int;
  v_seat int;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches where id = p_match for update;
  if not found or m.game <> 'uno' then raise exception 'Table not found.'; end if;
  if m.status <> 'lobby' then raise exception 'That table has already started.'; end if;
  if exists (select 1 from public.arena_match_players where match_id = p_match and user_id = v_uid) then
    raise exception 'You are already at this table.';
  end if;
  select count(*) into v_count from public.arena_match_players where match_id = p_match;
  if v_count >= m.max_players then raise exception 'This table is full.'; end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - m.stake where id = v_uid and balance >= m.stake;
  if not found then raise exception 'Insufficient balance.'; end if;

  select coalesce(max(seat), -1) + 1 into v_seat from public.arena_match_players where match_id = p_match;
  insert into public.arena_match_players (match_id, user_id, seat, stake) values (p_match, v_uid, v_seat, m.stake);
  update public.arena_matches set pot = pot + m.stake, updated_at = now() where id = p_match;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.uno_leave(p_match uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  st public.arena_uno_state%rowtype;
  v_seat int;
  v_is_host boolean;
  v_left jsonb;
  v_active int;
  v_winner uuid;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches where id = p_match and game = 'uno' for update;
  if not found then raise exception 'Table not found.'; end if;
  select seat into v_seat from public.arena_match_players where match_id = p_match and user_id = v_uid;
  if v_seat is null then raise exception 'You are not at this table.'; end if;

  if m.status = 'lobby' then
    select (v_seat = min(seat)) into v_is_host from public.arena_match_players where match_id = p_match;
    perform set_config('app.privileged', 'on', true);
    if v_is_host then
      -- Host closes the table: refund everyone, void it.
      update public.profiles p set balance = balance + mp.stake
        from public.arena_match_players mp
        where mp.match_id = p_match and mp.user_id = p.id;
      update public.arena_matches set status = 'void', result = 'cancelled', finished_at = now(), updated_at = now()
        where id = p_match;
    else
      update public.profiles set balance = balance + m.stake where id = v_uid;
      delete from public.arena_match_players where match_id = p_match and user_id = v_uid;
      update public.arena_matches set pot = pot - m.stake, updated_at = now() where id = p_match;
    end if;
    return json_build_object('ok', true);
  end if;

  if m.status <> 'active' then return json_build_object('ok', true); end if;

  -- Forfeit mid-game: drop their hand, mark seat as left, lose their stake.
  select * into st from public.arena_uno_state where match_id = p_match for update;
  delete from public.arena_uno_hands where match_id = p_match and user_id = v_uid;
  update public.arena_match_players set outcome = 'loss' where match_id = p_match and user_id = v_uid;
  v_left := st.left_seats || to_jsonb(v_seat);
  v_active := st.player_count - (select count(*) from jsonb_array_elements(v_left));

  if v_active <= 1 then
    -- Last player standing takes the pot.
    select mp.user_id into v_winner
    from public.arena_match_players mp
    where mp.match_id = p_match
      and not exists (select 1 from jsonb_array_elements_text(v_left) le where le::int = mp.seat)
    limit 1;
    if v_winner is not null then
      perform public._arena_finish_win(p_match, v_winner, 'last_standing');
    else
      perform public._arena_refund(p_match, 'abandoned', true);
    end if;
    return json_build_object('ok', true);
  end if;

  -- Game continues. If it was their turn, pass it on.
  update public.arena_uno_state set
    left_seats = v_left,
    current_seat = case when current_seat = v_seat
                        then public._uno_next_seat(player_count, current_seat, direction, v_left, 1)
                        else current_seat end,
    log = public._uno_tail(log || jsonb_build_object('u', v_uid, 't', 'left the game', 'at', now()), 30),
    last_action_at = now()
    where match_id = p_match;
  update public.arena_matches set updated_at = now() where id = p_match;
  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Start the game (host only): shuffle, deal, flip the first card
-- ---------------------------------------------------------------------------

create or replace function public.uno_start(p_match uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  v_host int;
  v_count int;
  v_pile jsonb;
  v_take jsonb;
  v_card jsonb;
  v_discard jsonb;
  v_guard int := 0;
  r record;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches where id = p_match and game = 'uno' for update;
  if not found then raise exception 'Table not found.'; end if;
  if m.status <> 'lobby' then raise exception 'This table has already started.'; end if;

  select min(seat) into v_host from public.arena_match_players where match_id = p_match;
  if (select seat from public.arena_match_players where match_id = p_match and user_id = v_uid) <> v_host then
    raise exception 'Only the host can start the game.';
  end if;
  select count(*) into v_count from public.arena_match_players where match_id = p_match;
  if v_count < 2 then raise exception 'Need at least 2 players to start.'; end if;

  -- Re-seat players 0..n-1 in join order so turn rotation is contiguous.
  -- Single atomic statement (no cursor) to avoid re-ordering mid-iteration.
  update public.arena_match_players amp
    set seat = s.rn
    from (
      select user_id, row_number() over (order by seat) - 1 as rn
      from public.arena_match_players where match_id = p_match
    ) s
    where amp.match_id = p_match and amp.user_id = s.user_id;

  v_pile := public._uno_deck();

  -- Deal 7 to each player in seat order.
  delete from public.arena_uno_hands where match_id = p_match;
  for r in select user_id from public.arena_match_players where match_id = p_match order by seat loop
    v_take := public._uno_take(v_pile, 7);
    insert into public.arena_uno_hands (match_id, user_id, cards) values (p_match, r.user_id, v_take->'taken');
    v_pile := v_take->'rest';
  end loop;

  -- Flip the first discard — re-flip until it's a plain number card so the
  -- opening has a concrete colour and no opening-action edge cases.
  loop
    v_guard := v_guard + 1;
    v_take := public._uno_take(v_pile, 1);
    v_card := (v_take->'taken')->0;
    v_pile := v_take->'rest';
    if v_card->>'v' in ('0','1','2','3','4','5','6','7','8','9') then
      v_discard := jsonb_build_array(v_card);
      exit;
    end if;
    v_pile := v_pile || jsonb_build_array(v_card);  -- send to the bottom, keep going
    exit when v_guard > 500;
  end loop;

  insert into public.arena_uno_state (match_id, draw_pile, discard, color, current_seat, direction,
                                      pending_draw, pending_type, player_count, left_seats, log, last_action_at)
  values (p_match, v_pile, v_discard, v_card->>'c', 0, 1, 0, null, v_count, '[]'::jsonb,
          jsonb_build_array(jsonb_build_object('u', null, 't', 'game started', 'at', now())), now())
  on conflict (match_id) do update set
    draw_pile = excluded.draw_pile, discard = excluded.discard, color = excluded.color,
    current_seat = 0, direction = 1, pending_draw = 0, pending_type = null,
    player_count = excluded.player_count, left_seats = '[]'::jsonb, log = excluded.log, last_action_at = now();

  update public.arena_matches set status = 'active', updated_at = now() where id = p_match;
  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Play / draw / force-skip
-- ---------------------------------------------------------------------------

create or replace function public.uno_play(p_match uuid, p_index int, p_color text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  st public.arena_uno_state%rowtype;
  v_seat int;
  v_hand jsonb;
  v_card jsonb;
  v_top jsonb;
  v_cv text;
  v_new_color text;
  v_legal boolean := false;
  v_active int;
  v_steps int := 1;
  v_dir int;
  v_pending int;
  v_ptype text;
  v_next int;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches where id = p_match and game = 'uno' and status = 'active' for update;
  if not found then raise exception 'No active game.'; end if;
  select seat into v_seat from public.arena_match_players where match_id = p_match and user_id = v_uid;
  if v_seat is null then raise exception 'You are not in this game.'; end if;
  select * into st from public.arena_uno_state where match_id = p_match for update;
  if st.current_seat <> v_seat then raise exception 'It is not your turn.'; end if;

  select cards into v_hand from public.arena_uno_hands where match_id = p_match and user_id = v_uid for update;
  if v_hand is null or p_index < 0 or p_index >= jsonb_array_length(v_hand) then
    raise exception 'No such card.';
  end if;
  v_card := v_hand->p_index;
  v_cv := v_card->>'v';
  v_top := st.discard->(jsonb_array_length(st.discard) - 1);

  -- Legality. A live +2/+4 stack restricts you to stacking the same type.
  if st.pending_draw > 0 then
    if st.pending_type = 'draw2' and v_cv = 'draw2' then v_legal := true;
    elsif st.pending_type = 'wild4' and v_cv = 'wild4' then v_legal := true;
    else raise exception 'You must draw the stacked cards (or stack another).'; end if;
  else
    if v_cv in ('wild', 'wild4') then v_legal := true;
    elsif (v_card->>'c') = st.color then v_legal := true;
    elsif v_cv = (v_top->>'v') then v_legal := true;
    end if;
    if not v_legal then raise exception 'That card cannot be played on the current pile.'; end if;
  end if;

  -- Colour: wilds need a declared colour; everything else uses its own colour.
  if v_cv in ('wild', 'wild4') then
    if p_color is null or p_color not in ('r','y','g','b') then raise exception 'Choose a colour for your wild.'; end if;
    v_new_color := p_color;
  else
    v_new_color := v_card->>'c';
  end if;

  -- Remove the card from the hand; push it to the discard top.
  v_hand := (v_hand - p_index);
  update public.arena_uno_hands set cards = v_hand where match_id = p_match and user_id = v_uid;

  -- Win: first to empty their hand takes the pot.
  if jsonb_array_length(v_hand) = 0 then
    update public.arena_uno_state set
      discard = discard || jsonb_build_array(v_card),
      color = v_new_color,
      log = public._uno_tail(log || jsonb_build_object('u', v_uid, 't', 'played their last card', 'at', now()), 30),
      last_action_at = now()
      where match_id = p_match;
    perform public._arena_finish_win(p_match, v_uid, 'uno');
    return json_build_object('ok', true, 'win', true);
  end if;

  v_active := st.player_count - (select count(*) from jsonb_array_elements(st.left_seats));
  v_dir := st.direction;
  v_pending := st.pending_draw;
  v_ptype := st.pending_type;

  if v_cv = 'skip' then
    v_steps := 2;
  elsif v_cv = 'rev' then
    v_dir := -st.direction;
    v_steps := case when v_active = 2 then 2 else 1 end;  -- reverse acts as skip heads-up
  elsif v_cv = 'draw2' then
    v_pending := v_pending + 2; v_ptype := 'draw2'; v_steps := 1;
  elsif v_cv = 'wild4' then
    v_pending := v_pending + 4; v_ptype := 'wild4'; v_steps := 1;
  else
    v_steps := 1;  -- numbers and plain wild
  end if;

  v_next := public._uno_next_seat(st.player_count, st.current_seat, v_dir, st.left_seats, v_steps);

  update public.arena_uno_state set
    discard = discard || jsonb_build_array(v_card),
    color = v_new_color,
    current_seat = v_next,
    direction = v_dir,
    pending_draw = v_pending,
    pending_type = case when v_pending > 0 then v_ptype else null end,
    log = public._uno_tail(log || jsonb_build_object('u', v_uid, 't', 'played ' || v_new_color || ' ' || v_cv, 'at', now()), 30),
    last_action_at = now()
    where match_id = p_match;
  update public.arena_matches set updated_at = now() where id = p_match;

  return json_build_object('ok', true, 'win', false);
end;
$$;

-- Shared draw routine: the player at p_seat draws (pending stack, or 1) and the
-- turn passes on. Reshuffles the discard into the draw pile if needed.
create or replace function public._uno_do_draw(p_match uuid, p_seat int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  st public.arena_uno_state%rowtype;
  v_user uuid;
  v_n int;
  v_top jsonb;
  v_reshuffled jsonb;
  v_take jsonb;
  v_next int;
begin
  select * into st from public.arena_uno_state where match_id = p_match for update;
  select user_id into v_user from public.arena_match_players where match_id = p_match and seat = p_seat;
  if v_user is null then return; end if;

  v_n := case when st.pending_draw > 0 then st.pending_draw else 1 end;

  -- Reshuffle the discard (minus its top) back into the draw pile if short.
  if jsonb_array_length(st.draw_pile) < v_n then
    v_top := st.discard->(jsonb_array_length(st.discard) - 1);
    select coalesce(jsonb_agg(e order by random()), '[]'::jsonb) into v_reshuffled
      from jsonb_array_elements(st.discard) with ordinality t(e, ord)
      where ord < jsonb_array_length(st.discard);
    st.draw_pile := st.draw_pile || v_reshuffled;
    st.discard := jsonb_build_array(v_top);
  end if;

  v_take := public._uno_take(st.draw_pile, v_n);
  update public.arena_uno_hands
    set cards = cards || (v_take->'taken')
    where match_id = p_match and user_id = v_user;

  v_next := public._uno_next_seat(st.player_count, p_seat, st.direction, st.left_seats, 1);

  update public.arena_uno_state set
    draw_pile = v_take->'rest',
    discard = st.discard,
    current_seat = v_next,
    pending_draw = 0,
    pending_type = null,
    log = public._uno_tail(log || jsonb_build_object('u', v_user, 't', 'drew ' || v_n || ' card(s)', 'at', now()), 30),
    last_action_at = now()
    where match_id = p_match;
  update public.arena_matches set updated_at = now() where id = p_match;
end;
$$;

create or replace function public.uno_draw(p_match uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  st public.arena_uno_state%rowtype;
  v_seat int;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if not exists (select 1 from public.arena_matches where id = p_match and game = 'uno' and status = 'active') then
    raise exception 'No active game.';
  end if;
  select seat into v_seat from public.arena_match_players where match_id = p_match and user_id = v_uid;
  if v_seat is null then raise exception 'You are not in this game.'; end if;
  select * into st from public.arena_uno_state where match_id = p_match;
  if st.current_seat <> v_seat then raise exception 'It is not your turn.'; end if;

  perform public._uno_do_draw(p_match, v_seat);
  return json_build_object('ok', true);
end;
$$;

-- Anyone at the table can nudge play along if the current player has stalled for
-- more than 45s, so one idle player can't freeze the whole table.
create or replace function public.uno_force_skip(p_match uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  st public.arena_uno_state%rowtype;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if not public.arena_is_player(p_match, v_uid) then raise exception 'You are not in this game.'; end if;
  if not exists (select 1 from public.arena_matches where id = p_match and game = 'uno' and status = 'active') then
    raise exception 'No active game.';
  end if;
  select * into st from public.arena_uno_state where match_id = p_match;
  if now() < st.last_action_at + interval '45 seconds' then
    raise exception 'Give the current player a moment.';
  end if;

  perform public._uno_do_draw(p_match, st.current_seat);
  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. uno_view — the ONE safe snapshot a client reads (own hand + public state)
-- ---------------------------------------------------------------------------

create or replace function public.uno_view(p_match uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  st public.arena_uno_state%rowtype;
  v_players json;
  v_my_hand jsonb;
  v_my_seat int;
  v_current uuid;
  v_top jsonb;
  v_host uuid;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches where id = p_match and game = 'uno';
  if not found then raise exception 'Game not found.'; end if;
  if not public.arena_is_player(p_match, v_uid) then raise exception 'You are not in this game.'; end if;

  select user_id into v_host from public.arena_match_players where match_id = p_match order by seat limit 1;
  select seat into v_my_seat from public.arena_match_players where match_id = p_match and user_id = v_uid;

  -- Lobby (not started yet): just players + table meta.
  if m.status = 'lobby' then
    select json_agg(json_build_object('user_id', mp.user_id, 'username', pr.username, 'seat', mp.seat) order by mp.seat)
      into v_players
      from public.arena_match_players mp join public.profiles pr on pr.id = mp.user_id
      where mp.match_id = p_match;
    return json_build_object(
      'status', m.status, 'pot', m.pot, 'stake', m.stake, 'max_players', m.max_players,
      'host_id', v_host, 'my_seat', v_my_seat, 'players', coalesce(v_players, '[]'::json),
      'my_hand', '[]'::jsonb
    );
  end if;

  select * into st from public.arena_uno_state where match_id = p_match;
  select cards into v_my_hand from public.arena_uno_hands where match_id = p_match and user_id = v_uid;

  if st.match_id is not null then
    select user_id into v_current from public.arena_match_players where match_id = p_match and seat = st.current_seat;
    v_top := st.discard->(jsonb_array_length(st.discard) - 1);

    select json_agg(json_build_object(
        'user_id', mp.user_id,
        'username', pr.username,
        'seat', mp.seat,
        'count', coalesce(jsonb_array_length(h.cards), 0),
        'left', exists (select 1 from jsonb_array_elements_text(st.left_seats) le where le::int = mp.seat)
      ) order by mp.seat)
      into v_players
      from public.arena_match_players mp
      join public.profiles pr on pr.id = mp.user_id
      left join public.arena_uno_hands h on h.match_id = mp.match_id and h.user_id = mp.user_id
      where mp.match_id = p_match;
  end if;

  return json_build_object(
    'status', m.status,
    'result', m.result,
    'winner_id', m.winner_id,
    'pot', m.pot,
    'stake', m.stake,
    'host_id', v_host,
    'my_seat', v_my_seat,
    'my_hand', coalesce(v_my_hand, '[]'::jsonb),
    'color', st.color,
    'direction', st.direction,
    'pending_draw', st.pending_draw,
    'pending_type', st.pending_type,
    'current_user_id', v_current,
    'top', v_top,
    'players', coalesce(v_players, '[]'::json),
    'log', st.log,
    'last_action_at', st.last_action_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
grant execute on function public.uno_create(numeric, int)   to authenticated;
grant execute on function public.uno_open_tables()           to authenticated;
grant execute on function public.uno_join(uuid)              to authenticated;
grant execute on function public.uno_leave(uuid)             to authenticated;
grant execute on function public.uno_start(uuid)             to authenticated;
grant execute on function public.uno_play(uuid, int, text)   to authenticated;
grant execute on function public.uno_draw(uuid)              to authenticated;
grant execute on function public.uno_force_skip(uuid)        to authenticated;
grant execute on function public.uno_view(uuid)              to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0022.
-- ============================================================================

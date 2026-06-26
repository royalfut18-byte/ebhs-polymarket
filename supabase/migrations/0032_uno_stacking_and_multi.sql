-- ============================================================================
-- EBHS Polymarket — migration 0032: UNO stacking rules
--
--   1. Cross-stacking: a +2 or +4 may be stacked on ANY pending draw stack
--      (so +2 on +4, +4 on +2, +2 on +2, +4 on +4 all work). The accumulated
--      draw count just grows by 2 or 4 per card.
--   2. Same-number multi-play: play several cards of the SAME NUMBER together in
--      one turn (uno_play_multi). The last card listed stays on top (its colour
--      becomes the active colour).
--
-- Run in the Supabase SQL editor on top of 0001–0031. Re-runnable.
-- ============================================================================

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

  -- Legality. A live +2/+4 stack now lets you stack ANY +2 or +4 on top.
  if st.pending_draw > 0 then
    if v_cv = 'draw2' or v_cv = 'wild4' then v_legal := true;
    else raise exception 'You must stack another +2/+4, or draw the cards.'; end if;
  else
    if v_cv in ('wild', 'wild4') then v_legal := true;
    elsif (v_card->>'c') = st.color then v_legal := true;
    elsif v_cv = (v_top->>'v') then v_legal := true;
    end if;
    if not v_legal then raise exception 'That card cannot be played on the current pile.'; end if;
  end if;

  if v_cv in ('wild', 'wild4') then
    if p_color is null or p_color not in ('r','y','g','b') then raise exception 'Choose a colour for your wild.'; end if;
    v_new_color := p_color;
  else
    v_new_color := v_card->>'c';
  end if;

  v_hand := (v_hand - p_index);
  update public.arena_uno_hands set cards = v_hand where match_id = p_match and user_id = v_uid;

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
    v_steps := case when v_active = 2 then 2 else 1 end;
  elsif v_cv = 'draw2' then
    v_pending := v_pending + 2; v_ptype := 'draw2'; v_steps := 1;
  elsif v_cv = 'wild4' then
    v_pending := v_pending + 4; v_ptype := 'wild4'; v_steps := 1;
  else
    v_steps := 1;
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

-- Play several cards of the SAME NUMBER in one turn. p_indices are hand indices;
-- the LAST one is left on top (its colour becomes the active colour).
create or replace function public.uno_play_multi(p_match uuid, p_indices int[])
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
  v_top jsonb;
  v_num text := null;
  v_card jsonb;
  v_i int;
  v_cnt int;
  v_lead jsonb;
  v_new_color text;
  v_color_ok boolean := false;
  v_new_hand jsonb := '[]'::jsonb;
  v_played jsonb := '[]'::jsonb;
  v_next int;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  v_cnt := coalesce(array_length(p_indices, 1), 0);
  if v_cnt < 1 then raise exception 'No cards selected.'; end if;

  select * into m from public.arena_matches where id = p_match and game = 'uno' and status = 'active' for update;
  if not found then raise exception 'No active game.'; end if;
  select seat into v_seat from public.arena_match_players where match_id = p_match and user_id = v_uid;
  if v_seat is null then raise exception 'You are not in this game.'; end if;
  select * into st from public.arena_uno_state where match_id = p_match for update;
  if st.current_seat <> v_seat then raise exception 'It is not your turn.'; end if;
  if st.pending_draw > 0 then raise exception 'You must respond to the +stack first.'; end if;

  select cards into v_hand from public.arena_uno_hands where match_id = p_match and user_id = v_uid for update;
  if v_hand is null then raise exception 'No hand.'; end if;
  if (select count(distinct x) from unnest(p_indices) x) <> v_cnt then
    raise exception 'Duplicate card selection.';
  end if;

  v_top := st.discard->(jsonb_array_length(st.discard) - 1);
  foreach v_i in array p_indices loop
    if v_i < 0 or v_i >= jsonb_array_length(v_hand) then raise exception 'No such card.'; end if;
    v_card := v_hand->v_i;
    if not ((v_card->>'v') in ('0','1','2','3','4','5','6','7','8','9')) then
      raise exception 'Only number cards can be played together.';
    end if;
    if v_num is null then v_num := v_card->>'v';
    elsif (v_card->>'v') <> v_num then raise exception 'All cards must be the same number.'; end if;
    if (v_card->>'c') = st.color then v_color_ok := true; end if;
  end loop;

  if v_num = (v_top->>'v') then v_color_ok := true; end if;
  if not v_color_ok then raise exception 'That stack cannot be played on the current pile.'; end if;

  v_lead := v_hand->(p_indices[v_cnt]);
  v_new_color := v_lead->>'c';

  for v_i in 0 .. jsonb_array_length(v_hand) - 1 loop
    if not (v_i = any(p_indices)) then
      v_new_hand := v_new_hand || jsonb_build_array(v_hand->v_i);
    end if;
  end loop;
  foreach v_i in array p_indices loop
    v_played := v_played || jsonb_build_array(v_hand->v_i);
  end loop;

  update public.arena_uno_hands set cards = v_new_hand where match_id = p_match and user_id = v_uid;

  if jsonb_array_length(v_new_hand) = 0 then
    update public.arena_uno_state set
      discard = discard || v_played,
      color = v_new_color,
      log = public._uno_tail(log || jsonb_build_object('u', v_uid, 't', 'played ' || v_cnt || '× ' || v_num, 'at', now()), 30),
      last_action_at = now()
      where match_id = p_match;
    perform public._arena_finish_win(p_match, v_uid, 'uno');
    return json_build_object('ok', true, 'win', true);
  end if;

  v_next := public._uno_next_seat(st.player_count, st.current_seat, st.direction, st.left_seats, 1);

  update public.arena_uno_state set
    discard = discard || v_played,
    color = v_new_color,
    current_seat = v_next,
    log = public._uno_tail(log || jsonb_build_object('u', v_uid, 't', 'played ' || v_cnt || '× ' || v_num, 'at', now()), 30),
    last_action_at = now()
    where match_id = p_match;
  update public.arena_matches set updated_at = now() where id = p_match;

  return json_build_object('ok', true, 'win', false);
end;
$$;

grant execute on function public.uno_play(uuid, int, text)   to authenticated;
grant execute on function public.uno_play_multi(uuid, int[])  to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0032.
-- ============================================================================

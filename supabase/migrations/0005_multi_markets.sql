-- ============================================================================
-- EBHS Polymarket — migration 0005: multi-outcome (grouped) markets
--
-- A multi-outcome market is modelled (Polymarket-style) as a GROUP of ordinary
-- binary YES/NO markets that share a group_id + group_title. Each option is its
-- own binary market ("Will <option> happen?") with its own LMSR price, so all
-- existing trading / pricing / positions / resolution logic works unchanged.
--
--   markets.group_id     uuid  — null for standalone markets
--   markets.group_title  text  — the shared question
--   markets.option_label text  — this option's label
--
-- Run in the Supabase SQL editor on top of 0001–0004. Re-runnable.
-- ============================================================================

alter table public.markets add column if not exists group_id uuid;
alter table public.markets add column if not exists group_title text;
alter table public.markets add column if not exists option_label text;

create index if not exists idx_markets_group on public.markets (group_id);

-- create_grouped_market: creates one binary market per option, all sharing a
-- new group_id. p_options is a JSON array: [{ "label": "...", "prob": 0.65 }, ...]
create or replace function public.create_grouped_market(
  p_title       text,
  p_description text,
  p_category    text,
  p_image_url   text,
  p_b           numeric,
  p_close_at    timestamptz,
  p_options     jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text := public.current_user_role();
  v_group uuid := gen_random_uuid();
  v_b     numeric := p_b;
  v_opt   jsonb;
  v_label text;
  v_p     double precision;
  v_qyes  double precision;
  v_count int := 0;
begin
  if v_role not in ('admin', 'subadmin') then
    raise exception 'Only admins and sub-admins can create markets.';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Question is required.';
  end if;
  if p_options is null or jsonb_array_length(p_options) < 2 then
    raise exception 'A multi-outcome market needs at least 2 options.';
  end if;
  if v_b is null or v_b <= 0 then v_b := 1000; end if;

  for v_opt in select * from jsonb_array_elements(p_options)
  loop
    v_label := trim(coalesce(v_opt ->> 'label', ''));
    continue when v_label = '';
    v_p := coalesce((v_opt ->> 'prob')::double precision, 0.5);
    if v_p < 0.01 then v_p := 0.01; end if;
    if v_p > 0.99 then v_p := 0.99; end if;
    v_qyes := v_b::double precision * ln(v_p / (1 - v_p));

    insert into public.markets
      (question, description, category, image_url, created_by, status,
       b, q_yes, q_no, initial_prob, close_at, group_id, group_title, option_label)
    values
      (trim(p_title) || ' — ' || v_label, coalesce(p_description, ''),
       coalesce(nullif(trim(p_category), ''), 'Random'), p_image_url,
       auth.uid(), 'open', v_b, v_qyes, 0, v_p, p_close_at,
       v_group, trim(p_title), v_label);

    v_count := v_count + 1;
  end loop;

  if v_count < 2 then
    raise exception 'A multi-outcome market needs at least 2 options with labels.';
  end if;

  return v_group;
end;
$$;

grant execute on function public.create_grouped_market(text, text, text, text, numeric, timestamptz, jsonb)
  to authenticated;

-- ============================================================================
-- End of migration 0005.
-- ============================================================================

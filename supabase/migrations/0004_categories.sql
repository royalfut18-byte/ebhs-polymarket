-- ============================================================================
-- EBHS Polymarket — migration 0004
--
-- Makes categories editable data instead of a hardcoded list:
--   • categories table (name + emoji + sort order), world-readable
--   • admin RPCs to create / rename+re-emoji / delete categories
--   • renaming a category re-points every market that used the old name
--   • seeds the original default categories
--
-- Run in the Supabase SQL editor on top of 0001–0003. Re-runnable.
-- ============================================================================

create table if not exists public.categories (
  name       text primary key,
  emoji      text not null default '🎲',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists categories_select_all on public.categories;
create policy categories_select_all on public.categories for select using (true);

grant select on public.categories to anon, authenticated;

-- Seed the original defaults (no-op if they already exist)
insert into public.categories (name, emoji, sort_order) values
  ('Sports', '🏀', 1),
  ('School', '🎓', 2),
  ('Politics', '🏛️', 3),
  ('Memes', '😹', 4),
  ('Random', '🎲', 5)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Admin RPCs (admin only)
-- ---------------------------------------------------------------------------
create or replace function public.create_category(p_name text, p_emoji text)
returns public.categories
language plpgsql
security definer
set search_path = public
as $$
declare v_name text := trim(p_name); c public.categories;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can manage categories.';
  end if;
  if v_name = '' then raise exception 'Category name is required.'; end if;
  if exists (select 1 from public.categories where name = v_name) then
    raise exception 'A category named "%" already exists.', v_name;
  end if;
  insert into public.categories (name, emoji, sort_order)
  values (
    v_name,
    coalesce(nullif(trim(p_emoji), ''), '🎲'),
    (select coalesce(max(sort_order), 0) + 1 from public.categories)
  )
  returning * into c;
  return c;
end;
$$;

-- Rename and/or change the emoji. Renaming re-points existing markets.
create or replace function public.update_category(p_old_name text, p_new_name text, p_emoji text)
returns public.categories
language plpgsql
security definer
set search_path = public
as $$
declare v_new text := trim(p_new_name); c public.categories;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can manage categories.';
  end if;
  if v_new = '' then raise exception 'Category name is required.'; end if;
  if v_new <> p_old_name and exists (select 1 from public.categories where name = v_new) then
    raise exception 'A category named "%" already exists.', v_new;
  end if;

  update public.categories
    set name = v_new, emoji = coalesce(nullif(trim(p_emoji), ''), '🎲')
    where name = p_old_name
    returning * into c;
  if not found then raise exception 'Category not found.'; end if;

  if v_new <> p_old_name then
    update public.markets set category = v_new where category = p_old_name;
  end if;
  return c;
end;
$$;

create or replace function public.delete_category(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can manage categories.';
  end if;
  delete from public.categories where name = p_name;
end;
$$;

grant execute on function public.create_category(text, text) to authenticated;
grant execute on function public.update_category(text, text, text) to authenticated;
grant execute on function public.delete_category(text) to authenticated;

-- ============================================================================
-- End of migration 0004.
-- ============================================================================

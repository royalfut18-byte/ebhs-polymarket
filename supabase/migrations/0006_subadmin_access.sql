-- ============================================================================
-- EBHS Polymarket — migration 0006
--
-- Let sub-admins (not just admins) manage CATEGORIES and PRIZES.
-- Re-defines the relevant RPCs to allow role in ('admin','subadmin').
-- (User management, balances and role changes stay admin-only.)
--
-- Run in the Supabase SQL editor on top of 0001–0005. Re-runnable.
-- ============================================================================

-- Prizes / settings ----------------------------------------------------------
create or replace function public.set_setting(p_key text, p_value jsonb)
returns public.app_settings
language plpgsql
security definer
set search_path = public
as $$
declare s public.app_settings;
begin
  if public.current_user_role() not in ('admin', 'subadmin') then
    raise exception 'Only admins and sub-admins can change settings.';
  end if;
  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning * into s;
  return s;
end;
$$;

-- Categories -----------------------------------------------------------------
create or replace function public.create_category(p_name text, p_emoji text)
returns public.categories
language plpgsql
security definer
set search_path = public
as $$
declare v_name text := trim(p_name); c public.categories;
begin
  if public.current_user_role() not in ('admin', 'subadmin') then
    raise exception 'Only admins and sub-admins can manage categories.';
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

create or replace function public.update_category(p_old_name text, p_new_name text, p_emoji text)
returns public.categories
language plpgsql
security definer
set search_path = public
as $$
declare v_new text := trim(p_new_name); c public.categories;
begin
  if public.current_user_role() not in ('admin', 'subadmin') then
    raise exception 'Only admins and sub-admins can manage categories.';
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
  if public.current_user_role() not in ('admin', 'subadmin') then
    raise exception 'Only admins and sub-admins can manage categories.';
  end if;
  delete from public.categories where name = p_name;
end;
$$;

grant execute on function public.set_setting(text, jsonb) to authenticated;
grant execute on function public.create_category(text, text) to authenticated;
grant execute on function public.update_category(text, text, text) to authenticated;
grant execute on function public.delete_category(text) to authenticated;

-- ============================================================================
-- End of migration 0006.
-- ============================================================================

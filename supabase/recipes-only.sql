-- ===== recipes-only.sql =====
-- "Just recipes" places (a family's or home cook's recipes): no staff, and everyone
-- edits only the recipes they added. The owner can edit any of them.
-- Run in the Supabase SQL Editor, after schema.sql and team-links.sql.
-- Safe to run again (it replaces what it made before).
--
-- The app keeps the setting with the place's data: one record,
--     kind 'placeSettings', id 'place', data { "recipesOnly": true }
-- These rules read it, so they hold no matter which screen, old link or old invite is used:
--
--     ONLY THE OWNER     changes the setting (a manager can't flip it to promote staff)
--     TURNED ON          staff become managers ("Can edit"), staff invites become manager
--                        invites, and staff invite links stop working
--     WHILE ON           a new staff invite or staff link is refused
--                        someone joining as staff (an old link) joins as a manager instead
--                        an owner can't change anyone to staff
-- Turning it off changes nobody back: managers stay managers.
--
-- Whose recipe is it? Each recipe's data has "createdBy": the id of whoever put it in
-- (scanned it, typed it, or made their own version). In a Just recipes place, a manager
-- ("Family" in the app):
--     RECIPES        adds their own; changes or deletes only ones they added
--     RECIPE LINES   changes only lines of their own recipes
--     INGREDIENTS    adds new ones; can't rename or remove one (others' recipes use it)
--     MENUS          makes their own; renames, reorders or deletes only ones they made
--     MENU ITEMS     adds a dish to any menu; takes off a dish they added, or any dish
--                    from a menu they made
-- The owner can change anything. Members' names ("Added by Mom") are in members.display_name.


-- ===== Is this place just recipes? =====

create or replace function public.is_recipes_only(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
    select coalesce((
        select (data ->> 'recipesOnly')::boolean from public.records
        where bar_id = target and kind = 'placeSettings' and id = 'place' and not deleted
    ), false)
$$;


-- The recipe books I'm in (for the list of places in the app)
create or replace function public.my_recipe_books() returns setof uuid
language sql stable security definer set search_path = ''
as $$
    select m.bar_id from public.members m
    where m.user_id = auth.uid() and public.is_recipes_only(m.bar_id)
$$;


-- What a link is for, before signing in, now also saying if it's a recipe book
--     ("You're joining the Maniccia Family recipe book")
drop function if exists public.peek_invite_link(text);
create function public.peek_invite_link(link_code text)
returns table (bar_name text, role text, recipe_book boolean)
language sql stable security definer set search_path = ''
as $$
    select b.name, l.role, public.is_recipes_only(b.id)
    from public.invite_links l join public.bars b on b.id = l.bar_id
    where l.code = link_code and not l.revoked and l.expires_at > now() and l.uses < l.max_uses
$$;
revoke execute on function public.peek_invite_link from public, anon, authenticated;
grant execute on function public.peek_invite_link to anon, authenticated;


-- Fix from team-links.sql: someone outside the place could turn off a link they'd been sent
--     (a missing role compared as "unknown", which didn't stop them)
create or replace function public.revoke_invite_link(link_code text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
    target uuid;
begin
    select bar_id into target from public.invite_links where code = link_code;
    if target is null or coalesce(public.my_role(target), '') not in ('owner', 'manager') then
        raise exception 'You can''t turn off that link';
    end if;
    update public.invite_links set revoked = true where code = link_code;
end;
$$;


-- ===== Only the owner changes it; turning it on clears out staff =====

create or replace function public.guard_place_settings() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    IF new.kind <> 'placeSettings' THEN
        return new;
    END IF;
    -- An upsert of a row that's already there: the update check (next) decides
    IF tg_op = 'INSERT' and exists (select 1 from public.records where bar_id = new.bar_id and kind = new.kind and id = new.id) THEN
        return new;
    END IF;
    -- Re-sending the same data (a device catching up) is fine for anyone who could write it
    IF tg_op = 'UPDATE' and old.data is not distinct from new.data and old.deleted = new.deleted THEN
        return new;
    END IF;
    IF public.my_role(new.bar_id) is distinct from 'owner' THEN
        raise exception 'Only an owner can change what this place is for';
    END IF;
    return new;
end;
$$;

drop trigger if exists guard_place_settings on public.records;
create trigger guard_place_settings before insert or update on public.records
    for each row execute function public.guard_place_settings();

create or replace function public.place_settings_changed() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    IF new.kind = 'placeSettings' and public.is_recipes_only(new.bar_id) THEN
        update public.members set role = 'manager' where bar_id = new.bar_id and role = 'staff';
        -- A staff invite becomes a manager one, unless that email already has one
        delete from public.invites s where s.bar_id = new.bar_id and s.role = 'staff'
            and exists (select 1 from public.invites m where m.bar_id = s.bar_id and m.email = s.email and m.role = 'manager');
        update public.invites set role = 'manager' where bar_id = new.bar_id and role = 'staff';
        update public.invite_links set revoked = true where bar_id = new.bar_id and role = 'staff';
    END IF;
    return null;
end;
$$;

drop trigger if exists place_settings_changed on public.records;
create trigger place_settings_changed after insert or update on public.records
    for each row execute function public.place_settings_changed();


-- ===== While it's on: no staff =====

-- Joining (email invite or link): staff -> manager. Changing a role to staff: refused.
create or replace function public.no_staff_members() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    IF new.role = 'staff' and public.is_recipes_only(new.bar_id) THEN
        IF tg_op = 'INSERT' THEN
            new.role := 'manager';
        ELSE
            raise exception 'A Just recipes place has no staff';
        END IF;
    END IF;
    return new;
end;
$$;

drop trigger if exists no_staff_members on public.members;
create trigger no_staff_members before insert or update of role on public.members
    for each row execute function public.no_staff_members();

-- New staff invites and staff links: refused
create or replace function public.no_staff_invites() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    IF new.role = 'staff' and public.is_recipes_only(new.bar_id) THEN
        raise exception 'A Just recipes place has no staff. Invite them to edit instead.';
    END IF;
    return new;
end;
$$;

drop trigger if exists no_staff_invites on public.invites;
create trigger no_staff_invites before insert or update of role on public.invites
    for each row execute function public.no_staff_invites();
drop trigger if exists no_staff_links on public.invite_links;
create trigger no_staff_links before insert on public.invite_links
    for each row execute function public.no_staff_invites();

-- ===== Everyone edits only their own recipes (the owner edits any) =====

-- Did I make this menu, or is it gone? (same idea, for dishes on a menu)
create or replace function public.my_menu_or_gone(target uuid, menu_id text) returns boolean
language sql stable security definer set search_path = ''
as $$
    select coalesce((
        select data ->> 'createdBy' = auth.uid()::text from public.records
        where bar_id = target and kind = 'menus' and id = menu_id and not deleted and data is not null
    ), true)
$$;

-- Can I change lines of this recipe? Mine, or it's gone (deleting my recipe takes its lines too)
create or replace function public.my_recipe_or_gone(target uuid, recipe_id text) returns boolean
language sql stable security definer set search_path = ''
as $$
    select coalesce((
        select data ->> 'createdBy' = auth.uid()::text from public.records
        where bar_id = target and kind = 'recipes' and id = recipe_id and not deleted and data is not null
    ), true)
$$;

create or replace function public.guard_family_recipes() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
    mine text := auth.uid()::text;
begin
    IF new.kind not in ('recipes', 'recipeLines', 'ingredients', 'menus', 'menuItems') THEN
        return new;
    END IF;
    IF public.my_role(new.bar_id) is distinct from 'manager' or not public.is_recipes_only(new.bar_id) THEN
        return new;         -- owners change anything; staff and strangers are stopped by RLS
    END IF;
    IF tg_op = 'INSERT' THEN
        IF exists (select 1 from public.records where bar_id = new.bar_id and kind = new.kind and id = new.id) THEN
            return new;     -- an upsert of a row that's there: the update check decides
        END IF;
    ELSE
        IF old.kind <> new.kind THEN
            raise exception 'A record can''t change what it is';
        END IF;
        IF old.data is not distinct from new.data and old.deleted = new.deleted THEN
            return new;     -- a device re-sending what's already here
        END IF;
    END IF;

    IF new.kind = 'recipes' THEN
        IF tg_op = 'UPDATE' and coalesce(old.data ->> 'createdBy', '') <> mine THEN
            raise exception 'You can only change recipes you added. Make your own version instead.';
        END IF;
        IF not new.deleted and coalesce(new.data ->> 'createdBy', '') <> mine THEN
            raise exception 'A recipe you add has to be yours';
        END IF;
    ELSIF new.kind = 'recipeLines' THEN
        IF tg_op = 'UPDATE' and not public.my_recipe_or_gone(new.bar_id, old.data ->> 'recipeId') THEN
            raise exception 'You can only change recipes you added. Make your own version instead.';
        END IF;
        IF not new.deleted and not public.my_recipe_or_gone(new.bar_id, new.data ->> 'recipeId') THEN
            raise exception 'You can only change recipes you added. Make your own version instead.';
        END IF;
    ELSIF new.kind = 'menus' THEN
        IF tg_op = 'UPDATE' and coalesce(old.data ->> 'createdBy', '') <> mine THEN
            raise exception 'Only whoever made this menu can change it';
        END IF;
        IF not new.deleted and coalesce(new.data ->> 'createdBy', '') <> mine THEN
            raise exception 'A menu you make has to be yours';
        END IF;
    ELSIF new.kind = 'menuItems' THEN
        IF tg_op = 'INSERT' THEN
            IF coalesce(new.data ->> 'createdBy', '') <> mine THEN
                raise exception 'A dish you add has to be yours';
            END IF;
        ELSIF new.deleted THEN
            -- Taking a dish off: one I added, or from my menu
            IF coalesce(old.data ->> 'createdBy', '') <> mine and not public.my_menu_or_gone(new.bar_id, old.data ->> 'menuId') THEN
                raise exception 'Only whoever made this menu can take that dish off';
            END IF;
        ELSIF not public.my_menu_or_gone(new.bar_id, old.data ->> 'menuId')
            or not public.my_menu_or_gone(new.bar_id, new.data ->> 'menuId')
            or new.data ->> 'createdBy' is distinct from old.data ->> 'createdBy' THEN
            raise exception 'Only whoever made this menu can change it';    -- moving dishes around
        END IF;
    ELSE    -- ingredients
        IF tg_op = 'UPDATE' and (new.deleted or old.data ->> 'name' is distinct from new.data ->> 'name') THEN
            raise exception 'Only the owner can rename or remove an ingredient';
        END IF;
    END IF;
    return new;
end;
$$;

drop trigger if exists guard_family_recipes on public.records;
create trigger guard_family_recipes before insert or update on public.records
    for each row execute function public.guard_family_recipes();


-- ===== Names: "Added by Mom" =====

alter table public.members add column if not exists display_name text not null default '';

-- Set my name everywhere I'm a member
create or replace function public.set_my_name(new_name text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
    IF length(trim(new_name)) > 60 THEN
        raise exception 'Keep your name under 60 characters';
    END IF;
    update public.members set display_name = trim(new_name) where user_id = auth.uid();
end;
$$;

-- Joining a place: bring my name along (from another place, or the name I signed up with)
create or replace function public.fill_member_name() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    IF new.display_name = '' THEN
        new.display_name := coalesce(
            (select display_name from public.members where user_id = new.user_id and display_name <> '' limit 1),
            (select left(trim(raw_user_meta_data ->> 'name'), 60) from auth.users where id = new.user_id),  -- from sign-up
            '');
    END IF;
    return new;
end;
$$;

drop trigger if exists fill_member_name on public.members;
create trigger fill_member_name before insert on public.members
    for each row execute function public.fill_member_name();

-- Anyone already in a place who signed up with a name: fill it in
update public.members m set display_name = left(trim(u.raw_user_meta_data ->> 'name'), 60)
from auth.users u
where u.id = m.user_id and m.display_name = '' and coalesce(trim(u.raw_user_meta_data ->> 'name'), '') <> '';

revoke execute on function public.is_recipes_only, public.guard_place_settings, public.place_settings_changed,
    public.no_staff_members, public.no_staff_invites, public.my_recipe_or_gone, public.guard_family_recipes,
    public.set_my_name, public.fill_member_name, public.my_recipe_books, public.my_menu_or_gone from public, anon;
grant execute on function public.is_recipes_only, public.set_my_name, public.my_recipe_books to authenticated;

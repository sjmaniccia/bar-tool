-- ===== owner-handoff.sql =====
-- Handing a place to its real owner. Often the manager on shift sets Agave up first and
-- becomes its owner; this lets them pass it to the person who actually owns the bar.
-- Run in the Supabase SQL Editor, after team-links.sql and recipes-only.sql.
-- Safe to run again.
--
--     make_handoff_link()   an owner makes a one-time link (7 days) for the real owner
--                           (a new one turns off any earlier hand-over link)
--     join_with_link()      someone opening it becomes an owner (joining, or promoted if
--                           they're already in), and whoever made the link steps down to
--                           manager, so there's one owner again
--     peek_invite_link()    already shows the role, so the join page can say "as the owner"


-- ===== Links can now be for owners =====

alter table public.invite_links drop constraint if exists invite_links_role_check;
alter table public.invite_links add constraint invite_links_role_check check (role in ('owner', 'manager', 'staff'));
alter table public.invite_links add column if not exists hands_over boolean not null default false;


-- ===== Make a hand-over link (owners) -> its code =====

create or replace function public.make_handoff_link(target_bar uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
    new_code text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
    if public.my_role(target_bar) is distinct from 'owner' then
        raise exception 'Only an owner can hand a place over';
    end if;
    update public.invite_links set revoked = true where bar_id = target_bar and hands_over and not revoked;
    insert into public.invite_links (code, bar_id, role, created_by, expires_at, max_uses, hands_over)
    values (new_code, target_bar, 'owner', auth.uid(), now() + interval '7 days', 1, true);
    return new_code;
end;
$$;


-- ===== Join with a link (replaces team-links.sql's) =====
--     staff/manager links: as before (already in -> nothing changes)
--     owner links: join or get promoted to owner; the link's maker steps down to manager

create or replace function public.join_with_link(link_code text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
    link public.invite_links%rowtype;
    my_email text;
    already text;
begin
    if auth.uid() is null then
        raise exception 'Sign in first';
    end if;
    select * into link from public.invite_links where code = link_code for update;
    if not found or link.revoked or link.expires_at <= now() or link.uses >= link.max_uses then
        raise exception 'This invite link doesn''t work anymore. Ask for a new one.';
    end if;
    select role into already from public.members where bar_id = link.bar_id and user_id = auth.uid();

    IF link.role <> 'owner' THEN
        IF already is not null THEN
            return link.bar_id;
        END IF;
        select lower(email) into my_email from auth.users where id = auth.uid();
        insert into public.members (bar_id, user_id, email, role)
        values (link.bar_id, auth.uid(), coalesce(my_email, ''), link.role);
        update public.invite_links set uses = uses + 1 where code = link_code;
        return link.bar_id;
    END IF;

    -- A hand-over: the one who made it can't use it on themselves
    IF link.created_by = auth.uid() THEN
        raise exception 'Send this link to the real owner. It''s for them, not you.';
    END IF;
    IF already is null THEN
        select lower(email) into my_email from auth.users where id = auth.uid();
        insert into public.members (bar_id, user_id, email, role)
        values (link.bar_id, auth.uid(), coalesce(my_email, ''), 'owner');
    ELSE
        update public.members set role = 'owner' where bar_id = link.bar_id and user_id = auth.uid();
    END IF;
    IF link.hands_over and link.created_by is not null THEN
        update public.members set role = 'manager'
        where bar_id = link.bar_id and user_id = link.created_by and role = 'owner';
    END IF;
    update public.invite_links set uses = uses + 1, revoked = true where code = link_code;
    return link.bar_id;
end;
$$;

revoke execute on function public.make_handoff_link from public, anon;
grant execute on function public.make_handoff_link, public.join_with_link to authenticated;

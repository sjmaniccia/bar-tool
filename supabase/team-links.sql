-- ===== team-links.sql =====
-- Invite links: show staff a QR code (or text them a link) and they join the bar.
-- Run once in the Supabase SQL Editor, after schema.sql.
--
-- The idea:
--     INVITE_LINKS   one row per link: a long random code, the bar, the role it gives,
--                    when it stops working, and how many people used it
--     make_invite_link()   owners make staff or manager links; managers make staff links
--     peek_invite_link()   "You're joining Shady's Corner as staff" (before signing in)
--     join_with_link()     the signed-in person joins the bar (once is enough)
--     revoke_invite_link() turns a link off right away
--
-- Why a link instead of an email invite: nobody has to type an address, and a whole
-- staff can join in a minute by scanning one QR code. The code is 128 random bits, so it
-- can't be guessed. Links stop working after 14 days, after 50 joins, or when revoked.
--
-- Security: RLS on; owners and managers can SEE their bar's links. Nobody can write
-- the table directly: only these functions change it, and each checks who's asking.


-- ===== Table =====

create table public.invite_links (
    code text primary key,
    bar_id uuid not null references public.bars (id) on delete cascade,
    role text not null check (role in ('manager', 'staff')),
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default now() + interval '14 days',
    revoked boolean not null default false,
    uses int not null default 0,
    max_uses int not null default 50
);

create index invite_links_bar on public.invite_links (bar_id);

alter table public.invite_links enable row level security;

create policy "managers see links" on public.invite_links
    for select to authenticated using (public.my_role(bar_id) in ('owner', 'manager'));

revoke all on public.invite_links from anon, authenticated;
grant select on public.invite_links to authenticated;


-- ===== Functions =====

-- Make a link -> its code
--     owners: staff or manager links; managers: staff links only (same rule as email invites)
create function public.make_invite_link(target_bar uuid, link_role text default 'staff') returns text
language plpgsql security definer set search_path = ''
as $$
declare
    new_code text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    me text := public.my_role(target_bar);
begin
    if link_role not in ('manager', 'staff') then
        raise exception 'Unknown role %', link_role;
    end if;
    if me is null or me = 'staff' or (me = 'manager' and link_role <> 'staff') then
        raise exception 'You can''t make that kind of invite link';
    end if;
    insert into public.invite_links (code, bar_id, role, created_by)
    values (new_code, target_bar, link_role, auth.uid());
    return new_code;
end;
$$;

-- What a link is for, if it still works (shown before signing in)
create function public.peek_invite_link(link_code text)
returns table (bar_name text, role text)
language sql stable security definer set search_path = ''
as $$
    select b.name, l.role
    from public.invite_links l join public.bars b on b.id = l.bar_id
    where l.code = link_code and not l.revoked and l.expires_at > now() and l.uses < l.max_uses
$$;

-- Join the bar the link is for -> the bar's id
--     IF already a member -> nothing changes (a manager scanning a staff link stays a manager)
create function public.join_with_link(link_code text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
    link public.invite_links%rowtype;
    my_email text;
begin
    if auth.uid() is null then
        raise exception 'Sign in first';
    end if;
    select * into link from public.invite_links where code = link_code for update;
    if not found or link.revoked or link.expires_at <= now() or link.uses >= link.max_uses then
        raise exception 'This invite link doesn''t work anymore. Ask for a new one.';
    end if;
    if exists (select 1 from public.members where bar_id = link.bar_id and user_id = auth.uid()) then
        return link.bar_id;
    end if;
    select lower(email) into my_email from auth.users where id = auth.uid();
    insert into public.members (bar_id, user_id, email, role)
    values (link.bar_id, auth.uid(), coalesce(my_email, ''), link.role);
    update public.invite_links set uses = uses + 1 where code = link_code;
    return link.bar_id;
end;
$$;

create function public.revoke_invite_link(link_code text) returns void
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

revoke execute on function public.make_invite_link, public.peek_invite_link, public.join_with_link, public.revoke_invite_link
    from public, anon, authenticated;
grant execute on function public.make_invite_link, public.join_with_link, public.revoke_invite_link to authenticated;
grant execute on function public.peek_invite_link to anon, authenticated;

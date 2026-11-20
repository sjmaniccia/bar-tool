-- ===== schema.sql =====
-- Agave's database on Supabase. Paste this whole file into the Supabase
-- SQL Editor once and press Run (see SETUP-SUPABASE.md).
--
-- The idea:
--     BARS       each bar (or restaurant, or brewery) is one account
--     MEMBERS    who belongs to a bar, and their role: owner, manager or staff
--     INVITES    an email someone was invited with, waiting for them to sign up
--     RECORDS    every row of the app's data (recipes, products, counts...),
--                stored as JSON, one database row per app row
--
-- Why one RECORDS table instead of 22 tables?
--     The app already keeps all its data in memory and saves it as JSON.
--     Storing each row as JSON lets every table sync the same way, and new
--     fields don't need a database change. Each row still syncs on its own,
--     so two people counting different shelves at once don't overwrite each other.
--     FIXME: when reports need to run on the server, move busy tables into real columns.
--
-- Security: Row Level Security (RLS) is on for every table, so the database
-- itself only hands each person their own bar's rows. The key in the app is
-- public on purpose; RLS is what keeps one bar out of another's data.


-- ===== Tables =====

create table public.bars (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(trim(name)) between 1 and 100),
    created_at timestamptz not null default now()
);

create table public.members (
    bar_id uuid not null references public.bars (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    email text not null,
    role text not null check (role in ('owner', 'manager', 'staff')),
    joined_at timestamptz not null default now(),
    primary key (bar_id, user_id)
);

create table public.invites (
    id uuid primary key default gen_random_uuid(),
    bar_id uuid not null references public.bars (id) on delete cascade,
    email text not null check (email = lower(trim(email)) and email like '%@%'),
    role text not null check (role in ('manager', 'staff')),
    invited_by uuid default auth.uid() references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    unique (bar_id, email)
);

create table public.records (
    bar_id uuid not null references public.bars (id) on delete cascade,
    kind text not null,                 -- which app table: "recipes", "countLines"...
    id text not null,                   -- the row's id in the app
    data jsonb,                         -- the row itself (null once deleted)
    deleted boolean not null default false,   -- kept so other devices learn about deletes
    seq bigint generated always as identity,  -- creation order (recipe lines stay in order)
    updated_at timestamptz not null default now(),
    updated_by uuid default auth.uid(),
    primary key (bar_id, kind, id)
);

create index records_by_bar on public.records (bar_id, seq);


-- ===== Who am I in this bar? =====

-- My role in a bar, or null if I'm not a member.
-- SECURITY DEFINER = runs with the owner's rights, so it can read members
-- without the members policy calling itself in a loop.
create function public.my_role(target uuid) returns text
language sql stable security definer set search_path = ''
as $$
    select role from public.members where bar_id = target and user_id = (select auth.uid())
$$;

-- Which app tables staff may change: counting and the waste log, nothing with prices
create function public.staff_can_write(kind text) returns boolean
language sql immutable set search_path = ''
as $$
    select kind in ('stockCounts', 'countLines', 'wasteEntries')
$$;


-- ===== Row Level Security =====

alter table public.bars enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.records enable row level security;

-- BARS: members can see their bar; only the owner renames or deletes it.
-- New bars are made with create_bar() below, which also makes you the owner.
create policy "members see their bar" on public.bars
    for select to authenticated using (public.my_role(id) is not null);
create policy "owner renames bar" on public.bars
    for update to authenticated using (public.my_role(id) = 'owner') with check (public.my_role(id) = 'owner');
create policy "owner deletes bar" on public.bars
    for delete to authenticated using (public.my_role(id) = 'owner');

-- MEMBERS: everyone in a bar can see the team. Changes go through
-- set_member_role() and remove_member(), which check the rules.
create policy "members see the team" on public.members
    for select to authenticated using (public.my_role(bar_id) is not null);

-- INVITES: owners invite anyone; managers can only invite staff
create policy "managers see invites" on public.invites
    for select to authenticated using (public.my_role(bar_id) in ('owner', 'manager'));
create policy "managers invite" on public.invites
    for insert to authenticated with check (
        public.my_role(bar_id) = 'owner'
        or (public.my_role(bar_id) = 'manager' and role = 'staff')
    );
create policy "managers cancel invites" on public.invites
    for delete to authenticated using (public.my_role(bar_id) in ('owner', 'manager'));

-- RECORDS: every member reads the bar's data.
-- Owners and managers change anything; staff only counts and waste.
-- Nothing is ever hard-deleted by the app (it sets deleted = true instead).
create policy "members read data" on public.records
    for select to authenticated using (public.my_role(bar_id) is not null);
create policy "members add data" on public.records
    for insert to authenticated with check (
        public.my_role(bar_id) in ('owner', 'manager')
        or (public.my_role(bar_id) = 'staff' and public.staff_can_write(kind))
    );
create policy "members change data" on public.records
    for update to authenticated
    using (
        public.my_role(bar_id) in ('owner', 'manager')
        or (public.my_role(bar_id) = 'staff' and public.staff_can_write(kind))
    )
    with check (
        public.my_role(bar_id) in ('owner', 'manager')
        or (public.my_role(bar_id) = 'staff' and public.staff_can_write(kind))
    );

-- Stamp every change with the time and who made it (the app can't fake these)
create function public.stamp_record() returns trigger
language plpgsql set search_path = ''
as $$
begin
    new.updated_at := now();
    new.updated_by := auth.uid();
    return new;
end;
$$;

create trigger stamp_record before insert or update on public.records
    for each row execute function public.stamp_record();


-- ===== Actions (each checks its own rules) =====

-- Make a new bar and make me its owner. Returns the new bar's id.
create function public.create_bar(bar_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
    new_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Sign in first';
    end if;
    insert into public.bars (name) values (trim(bar_name)) returning id into new_id;
    insert into public.members (bar_id, user_id, email, role)
        values (new_id, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'owner');
    return new_id;
end;
$$;

-- Join every bar that invited my email. Returns how many I joined.
--     Only for confirmed emails, or anyone could sign up as someone else's
--     address and take their invite.
create function public.accept_invites() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
    my_email text;
    joined integer;
begin
    select lower(email) into my_email from auth.users
        where id = auth.uid() and email_confirmed_at is not null;
    if my_email is null then
        return 0;
    end if;
    insert into public.members (bar_id, user_id, email, role)
        select bar_id, auth.uid(), my_email, role from public.invites where email = my_email
        on conflict (bar_id, user_id) do nothing;
    get diagnostics joined = row_count;
    delete from public.invites where email = my_email;
    return joined;
end;
$$;

-- Change someone's role (owners only). A bar always keeps at least one owner.
create function public.set_member_role(target_bar uuid, target_user uuid, new_role text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
    if public.my_role(target_bar) is distinct from 'owner' then
        raise exception 'Only an owner can change roles';
    end if;
    if new_role not in ('owner', 'manager', 'staff') then
        raise exception 'Unknown role %', new_role;
    end if;
    if new_role <> 'owner' and (select role from public.members where bar_id = target_bar and user_id = target_user) = 'owner'
        and (select count(*) from public.members where bar_id = target_bar and role = 'owner') = 1 then
        raise exception 'A bar needs at least one owner';
    end if;
    update public.members set role = new_role where bar_id = target_bar and user_id = target_user;
end;
$$;

-- Remove someone (owners), or leave a bar yourself. The last owner can't leave.
create function public.remove_member(target_bar uuid, target_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
    if target_user <> auth.uid() and public.my_role(target_bar) is distinct from 'owner' then
        raise exception 'Only an owner can remove people';
    end if;
    if (select role from public.members where bar_id = target_bar and user_id = target_user) = 'owner'
        and (select count(*) from public.members where bar_id = target_bar and role = 'owner') = 1 then
        raise exception 'A bar needs at least one owner';
    end if;
    delete from public.members where bar_id = target_bar and user_id = target_user;
end;
$$;


-- ===== Permissions =====

-- Supabase projects made since May 2026 don't open new tables to the app
-- automatically, so each one is granted here: only what the app does, and
-- only to signed-in people. RLS above then decides which rows.
-- Signed-out visitors (anon) get nothing.
revoke all on public.bars, public.members, public.invites, public.records from anon;
grant select, update, delete on public.bars to authenticated;
grant select on public.members to authenticated;
grant select, insert, delete on public.invites to authenticated;
grant select, insert, update on public.records to authenticated;

revoke execute on function public.create_bar, public.accept_invites, public.set_member_role,
    public.remove_member, public.my_role, public.staff_can_write from public, anon;
grant execute on function public.create_bar, public.accept_invites, public.set_member_role,
    public.remove_member, public.my_role, public.staff_can_write to authenticated;

-- Live updates: tell the app when another device changes a record
alter publication supabase_realtime add table public.records;

-- ===== pos.sql =====
-- POS connections (Square now, Toast later). Run once in the Supabase SQL Editor,
-- after schema.sql (see SETUP-SQUARE.md).
--
-- The idea:
--     POS_CONNECTIONS   one row per bar per POS: the keys Square gave us for that bar
--     OAUTH_STATES      a one-time code for each "Connect Square" click, so nobody can
--                       trick Agave into attaching their Square account to your bar
--
-- Security: the keys are the most sensitive thing Agave stores. These tables have
-- Row Level Security ON and NO policies, so the app (anon and signed-in people) can't
-- read or write them at all. Only the server function, using the secret key, can.
-- The app learns "connected or not" through pos_status(), which never returns keys.
-- FIXME: encrypt access_token and refresh_token with Supabase Vault for extra protection.


-- ===== Tables =====

create table public.pos_connections (
    bar_id uuid not null references public.bars (id) on delete cascade,
    provider text not null check (provider in ('square', 'toast')),
    merchant_id text,
    merchant_name text,
    access_token text not null,
    refresh_token text,
    expires_at timestamptz,
    connected_by uuid references auth.users (id) on delete set null,
    connected_at timestamptz not null default now(),
    last_synced_at timestamptz,
    last_error text,
    primary key (bar_id, provider)
);

create table public.oauth_states (
    state text primary key,
    bar_id uuid not null references public.bars (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    provider text not null,
    return_url text not null,
    created_at timestamptz not null default now()
);

alter table public.pos_connections enable row level security;
alter table public.oauth_states enable row level security;
-- (no policies on purpose: only the server can touch these)

revoke all on public.pos_connections, public.oauth_states from anon, authenticated;


-- ===== What the app is allowed to see =====

-- Is this bar connected to a POS, and when did it last sync? No keys, members only.
create function public.pos_status(target_bar uuid)
returns table (provider text, merchant_name text, connected_at timestamptz, last_synced_at timestamptz, last_error text)
language sql stable security definer set search_path = ''
as $$
    select provider, merchant_name, connected_at, last_synced_at, last_error
    from public.pos_connections
    where bar_id = target_bar and public.my_role(target_bar) is not null
$$;

revoke execute on function public.pos_status from public, anon;
grant execute on function public.pos_status to authenticated;

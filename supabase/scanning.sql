-- ===== scanning.sql =====
-- Limits on invoice scanning, so the Anthropic bill can't run away. Run once in the
-- Supabase SQL Editor, after schema.sql (see SETUP-SCANNING.md).
--
-- The idea:
--     INVOICE_SCANS   one row per scan: which bar, who, how many pages, when
--     SCAN_LIMITS     a bar's own limits, only for bars that get more than the default
--                     (no row = 20 scans a day, 300 a month)
--     claim_scan()    the server function calls this BEFORE asking Claude:
--                         lock this bar (so two scans at once can't both sneak past)
--                         count its scans in the last 24 hours and this month
--                         IF either is at its limit -> no scan
--                         ELSE write the scan down and say go ahead
--     release_scan()  IF Claude refused the request (not billed) -> give the scan back
--     scan_usage()    what the app shows: "4 of 300 scans this month"
--
-- Security: like the POS keys, these tables have Row Level Security ON and NO
-- policies, so nobody in the app can read them, add to them or delete from them.
-- Only the server function (secret key) can claim and release scans. Owners can't
-- raise their own limits: SCAN_LIMITS is server-only too, so only you can, here.
--
-- To give a bar more (say, a paid plan), in the SQL Editor:
--     insert into public.scan_limits (bar_id, daily_limit, monthly_limit)
--     values ('the-bar-id', 60, 1500)
--     on conflict (bar_id) do update set daily_limit = excluded.daily_limit, monthly_limit = excluded.monthly_limit;


-- ===== Tables =====

create table public.invoice_scans (
    id bigint generated always as identity primary key,
    bar_id uuid not null references public.bars (id) on delete cascade,
    user_id uuid references auth.users (id) on delete set null,
    pages int not null check (pages between 1 and 10),
    scanned_at timestamptz not null default now()
);

create index invoice_scans_bar_time on public.invoice_scans (bar_id, scanned_at);

create table public.scan_limits (
    bar_id uuid primary key references public.bars (id) on delete cascade,
    daily_limit int not null check (daily_limit >= 0),
    monthly_limit int not null check (monthly_limit >= 0)
);

alter table public.invoice_scans enable row level security;
alter table public.scan_limits enable row level security;
-- (no policies on purpose: only the server can touch these)

revoke all on public.invoice_scans, public.scan_limits from anon, authenticated;


-- ===== Counting =====

-- A bar's limits and how much of them it has used. Months reset on the 1st (UTC);
-- the daily limit counts the last 24 hours, so it never resets all at once.
create function public.scan_counts(target_bar uuid)
returns table (today_count int, month_count int, daily_limit int, monthly_limit int)
language sql stable security definer set search_path = ''
as $$
    select
        (select count(*)::int from public.invoice_scans s
            where s.bar_id = target_bar and s.scanned_at > now() - interval '24 hours'),
        (select count(*)::int from public.invoice_scans s
            where s.bar_id = target_bar and s.scanned_at >= date_trunc('month', now())),
        coalesce((select l.daily_limit from public.scan_limits l where l.bar_id = target_bar), 20),
        coalesce((select l.monthly_limit from public.scan_limits l where l.bar_id = target_bar), 300)
$$;

-- For the app: members of the bar see its usage; everyone else sees nothing
create function public.scan_usage(target_bar uuid)
returns table (today_count int, month_count int, daily_limit int, monthly_limit int)
language sql stable security definer set search_path = ''
as $$
    select c.* from public.scan_counts(target_bar) c
    where public.my_role(target_bar) is not null
$$;


-- ===== Claiming a scan (server only) =====

-- Returns the new scan's id, or null if the bar is at a limit, plus the counts
create function public.claim_scan(target_bar uuid, who uuid, page_count int)
returns table (scan_id bigint, today_count int, month_count int, daily_limit int, monthly_limit int)
language plpgsql security definer set search_path = ''
as $$
declare
    c record;
    new_id bigint;
begin
    -- One scan decision at a time per bar (released when this transaction ends)
    perform pg_advisory_xact_lock(hashtext('scan:' || target_bar::text));
    select * into c from public.scan_counts(target_bar);
    if c.today_count >= c.daily_limit or c.month_count >= c.monthly_limit then
        return query select null::bigint, c.today_count, c.month_count, c.daily_limit, c.monthly_limit;
        return;
    end if;
    insert into public.invoice_scans (bar_id, user_id, pages)
    values (target_bar, who, page_count)
    returning id into new_id;
    return query select new_id, c.today_count + 1, c.month_count + 1, c.daily_limit, c.monthly_limit;
end;
$$;

-- Give a scan back when Claude turned the request down (so it wasn't billed)
create function public.release_scan(scan_id bigint)
returns void
language sql security definer set search_path = ''
as $$
    delete from public.invoice_scans where id = scan_id
$$;

revoke execute on function public.scan_counts, public.scan_usage, public.claim_scan, public.release_scan from public, anon, authenticated;
grant execute on function public.scan_usage to authenticated;
grant execute on function public.claim_scan, public.release_scan to service_role;

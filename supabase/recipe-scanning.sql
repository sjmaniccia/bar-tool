-- ===== recipe-scanning.sql =====
-- Adds recipe pages to the scan limits. Run once in the Supabase SQL Editor, AFTER
-- scanning.sql (see SETUP-SCANNING.md).
--
-- Recipe books are scanned in big batches (a whole binder in an afternoon), so recipe
-- pages get their own, bigger allowance, separate from invoices:
--     invoices       20 a day, 300 a month   (from scanning.sql)
--     recipe pages  150 a day, 600 a month
-- A recipe page costs about the same as an invoice page: 600 pages is roughly $1.
--
-- What changes:
--     INVOICE_SCANS gets a KIND column ('invoice' or 'recipe'); old rows are invoices
--     SCAN_LIMITS gets optional recipe limits per bar (empty = the defaults above)
--     the counting and claiming functions take a kind (invoice if left out, so the
--     invoice function keeps working exactly as before)
--
-- To give one bar more recipe pages (say, a big restaurant group digitizing everything):
--     insert into public.scan_limits (bar_id, daily_limit, monthly_limit, recipe_daily_limit, recipe_monthly_limit)
--     values ('the-bar-id', 20, 300, 400, 2000)
--     on conflict (bar_id) do update set recipe_daily_limit = excluded.recipe_daily_limit,
--         recipe_monthly_limit = excluded.recipe_monthly_limit;


-- ===== Tables =====

alter table public.invoice_scans
    add column kind text not null default 'invoice' check (kind in ('invoice', 'recipe'));

drop index if exists public.invoice_scans_bar_time;
create index invoice_scans_bar_kind_time on public.invoice_scans (bar_id, kind, scanned_at);

alter table public.scan_limits
    alter column daily_limit drop not null,
    alter column monthly_limit drop not null,
    add column recipe_daily_limit int check (recipe_daily_limit >= 0),
    add column recipe_monthly_limit int check (recipe_monthly_limit >= 0);


-- ===== Functions, now by kind =====
-- (dropped and made again because their inputs changed)

drop function public.scan_usage(uuid);
drop function public.claim_scan(uuid, uuid, int);
drop function public.scan_counts(uuid);

create function public.scan_counts(target_bar uuid, scan_kind text default 'invoice')
returns table (today_count int, month_count int, daily_limit int, monthly_limit int)
language sql stable security definer set search_path = ''
as $$
    select
        (select count(*)::int from public.invoice_scans s
            where s.bar_id = target_bar and s.kind = scan_kind and s.scanned_at > now() - interval '24 hours'),
        (select count(*)::int from public.invoice_scans s
            where s.bar_id = target_bar and s.kind = scan_kind and s.scanned_at >= date_trunc('month', now())),
        coalesce((select case when scan_kind = 'recipe' then l.recipe_daily_limit else l.daily_limit end
            from public.scan_limits l where l.bar_id = target_bar),
            case when scan_kind = 'recipe' then 150 else 20 end),
        coalesce((select case when scan_kind = 'recipe' then l.recipe_monthly_limit else l.monthly_limit end
            from public.scan_limits l where l.bar_id = target_bar),
            case when scan_kind = 'recipe' then 600 else 300 end)
$$;

create function public.scan_usage(target_bar uuid, scan_kind text default 'invoice')
returns table (today_count int, month_count int, daily_limit int, monthly_limit int)
language sql stable security definer set search_path = ''
as $$
    select c.* from public.scan_counts(target_bar, scan_kind) c
    where public.my_role(target_bar) is not null
$$;

create function public.claim_scan(target_bar uuid, who uuid, page_count int, scan_kind text default 'invoice')
returns table (scan_id bigint, today_count int, month_count int, daily_limit int, monthly_limit int)
language plpgsql security definer set search_path = ''
as $$
declare
    c record;
    new_id bigint;
begin
    if scan_kind not in ('invoice', 'recipe') then
        raise exception 'unknown scan kind %', scan_kind;
    end if;
    -- One scan decision at a time per bar (released when this transaction ends)
    perform pg_advisory_xact_lock(hashtext('scan:' || target_bar::text));
    select * into c from public.scan_counts(target_bar, scan_kind);
    if c.today_count >= c.daily_limit or c.month_count >= c.monthly_limit then
        return query select null::bigint, c.today_count, c.month_count, c.daily_limit, c.monthly_limit;
        return;
    end if;
    insert into public.invoice_scans (bar_id, user_id, pages, kind)
    values (target_bar, who, page_count, scan_kind)
    returning id into new_id;
    return query select new_id, c.today_count + 1, c.month_count + 1, c.daily_limit, c.monthly_limit;
end;
$$;

revoke execute on function public.scan_counts, public.scan_usage, public.claim_scan from public, anon, authenticated;
grant execute on function public.scan_usage to authenticated;
grant execute on function public.claim_scan to service_role;

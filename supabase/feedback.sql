-- ===== feedback.sql =====
-- The suggestion box: anyone signed in can send an idea or a problem from the app.
-- Run once in the Supabase SQL Editor, after schema.sql.
--
-- The idea:
--     FEEDBACK          one row per message: who, which place, idea/problem/other,
--                       the message, the page they were on, and app or website
--     send_feedback()   the only way in: it fills in who's sending, checks they belong
--                       to the place, and allows 20 messages a day per person
--
-- Reading it: each message is also emailed to Agave's inbox (send-feedback function).
-- This table is the backup: Supabase dashboard > Table Editor > feedback.
-- Nobody can read it from the app, not even their own messages: it's a one-way box,
-- so one tester can never see another's feedback.
--
-- Deleting an account keeps the message but clears who sent it (on delete set null).


-- ===== Table =====

create table public.feedback (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    user_id uuid references auth.users (id) on delete set null,
    email text,
    bar_id uuid references public.bars (id) on delete set null,
    kind text not null check (kind in ('idea', 'problem', 'other')),
    message text not null check (char_length(message) between 1 and 4000),
    page text,
    app text
);

create index feedback_user_day on public.feedback (user_id, created_at);

-- RLS on with no policies: the table can't be read or written directly by anyone
-- but the dashboard (service role). send_feedback() below is the only door in.
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to service_role;     -- the send-feedback function reads it back


-- ===== Sending =====

-- send_feedback(kind, message, page, app, target_bar)
--     CHECK  signed in, kind is one of the three, message isn't empty
--     CHECK  target_bar is null or a place they belong to
--     CHECK  fewer than 20 messages from them in the last 24 hours
--     SAVE   with their id and email filled in here (never trusted from the app)
create function public.send_feedback(
    feedback_kind text,
    feedback_message text,
    feedback_page text default null,
    feedback_app text default null,
    target_bar uuid default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
    me uuid := (select auth.uid());
    new_id uuid;
begin
    if me is null then
        raise exception 'Sign in to send feedback.';
    end if;
    if feedback_kind not in ('idea', 'problem', 'other') then
        raise exception 'Pick idea, problem or something else.';
    end if;
    if char_length(trim(coalesce(feedback_message, ''))) = 0 then
        raise exception 'Write a message first.';
    end if;
    if target_bar is not null and public.my_role(target_bar) is null then
        target_bar := null;     -- not their place: keep the message, drop the place
    end if;
    if (select count(*) from public.feedback
        where user_id = me and created_at > now() - interval '1 day') >= 20 then
        raise exception 'That''s 20 messages today. Thanks for all of it! Try again tomorrow.';
    end if;

    insert into public.feedback (user_id, email, bar_id, kind, message, page, app)
    values (
        me,
        (select email from auth.users where id = me),
        target_bar,
        feedback_kind,
        left(trim(feedback_message), 4000),
        left(feedback_page, 200),
        left(feedback_app, 100)
    )
    returning id into new_id;
    return new_id;
end;
$$;

revoke all on function public.send_feedback from public, anon;
grant execute on function public.send_feedback to authenticated;

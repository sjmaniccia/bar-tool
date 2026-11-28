# Setting up accounts (Supabase)

Agave runs without this: with no Supabase project connected, it keeps data in
each visitor's browser, like before. These steps turn on accounts, teams and
syncing between devices. It takes about 15 minutes and costs nothing.

## 1. Make the project

1. Sign up at [supabase.com](https://supabase.com) (GitHub sign-in is easiest).
2. **New project**. Name it `agave`, pick the region closest to Chattanooga
   (East US), and let it generate a database password. Save that password in your
   password manager. The app never uses it, but you'll want it someday.
3. Wait a minute or two while it starts.

## 2. Create the tables

1. In the left sidebar, open **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, copy all of it, paste it in, press **Run**.
3. You should see "Success. No rows returned." Under **Table Editor** you'll now
   have `bars`, `members`, `invites` and `records`, each marked with RLS on.

Run the file only once. (To start over: Project Settings → General → delete the
project, and make a new one.)

Then, the same way, each in its own new query, once:

| File | What it adds |
|---|---|
| `supabase/team-links.sql` | Invite links and QR codes (staff join by scanning) |
| `supabase/feedback.sql` | The suggestion box: read messages in Table Editor > feedback |
| `supabase/recipe-photos.sql` | Recipe pictures (a storage bucket, managers can add) |
| `supabase/owner-handoff.sql` | Hand a place to its real owner (a one-time link from the Account page). Safe to run again |
| `supabase/recipes-only.sql` | "Just recipes" places: no staff, family change only their own recipes, names for "Added by". Safe to run again |
| `supabase/pos.sql` | Square (see SETUP-SQUARE.md) |
| `supabase/scanning.sql`, then `supabase/recipe-scanning.sql` | Scan limits (see SETUP-SCANNING.md) |

## 3. Sign-in settings

Open **Authentication** → **URL Configuration**:

- **Site URL**: `https://sjmaniccia.github.io/bar-tool/`
- **Redirect URLs**: add both
  - `https://sjmaniccia.github.io/bar-tool/`
  - `http://localhost:5173/`

These are where the "confirm your email" and "reset password" links send people.

Leave **Confirm email** on (Authentication → Sign In / Providers → Email). It stops
someone from signing up with a bartender's email and taking their invite.

> **Email limit:** Supabase's built-in email sender only allows a few emails per hour,
> which is fine for you and a few testers. Before real bars sign up, connect a free
> email service (Resend or Brevo) under Authentication → Emails → SMTP Settings.

## 4. Connect the app on your Mac

1. In Supabase: **Project Settings** → **API Keys**. Copy the **publishable** key
   (starts with `sb_publishable_`). Then **Project Settings** → **Data API** and
   copy the **Project URL**.
2. In the `bar-tool` folder, copy `.env.example` to a new file named `.env.local`:
   ```
   cp .env.example .env.local
   ```
3. Open `.env.local` in VS Code and paste the two values in.
4. `npm run dev` and open http://localhost:5173. You'll get the sign-in screen.

`.env.local` is in `.gitignore`, so it never gets committed.

**Is it safe that the key ends up in the website?** Yes. The publishable key is
meant to be public. It identifies the project; it doesn't unlock anything.
What protects each bar's data is Row Level Security in `schema.sql`. Never put the
**secret** key (`sb_secret_...`) in the app.

## 5. Connect the live site (GitHub Pages)

1. On GitHub: your `bar-tool` repo → **Settings** → **Secrets and variables** →
   **Actions** → **Variables** tab → **New repository variable**. Add two:
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the publishable key
2. Push any commit (or **Actions** → Deploy → **Run workflow**). The workflow reads
   them while building.

## 6. Try it

1. **Create account** with your email, then click the link in the email.
2. Sign in, name your bar, and pick what to start with. If you used Agave before
   signing up, "What I set up on this device" brings that data along.
3. **Team** page: invite a second email of yours as Staff. Sign in with it in a
   private window: it lands on Stock counts and only sees counting, waste,
   training and spec books.
4. Count something on one device and reload the other. Live updates arrive by
   themselves once both are signed in.

## Keeping it free

- **Pausing:** Supabase pauses free projects that get no use for a week. You get
  an email first; opening the app or the dashboard keeps it awake. A paused
  project can be restored from the dashboard.
- **Limits:** 500 MB of database per project. A bar's data is a few MB, so
  that's room for a lot of bars.
- **Two free projects per account**, so you can keep a second one for testing.

## How it fits together

```
Browser (Agave)                         Supabase
  data in memory  ── changes ──▶   records table (one row per app row)
  copy on device  ◀─ live updates ─  Row Level Security: only your bar's rows
                                     members table: owner / manager / staff
```

- Every change is saved on the device first, so counting in a walk-in with no
  signal works. Changes are sent when the connection comes back.
- Each row syncs on its own, so two people counting different shelves at once
  don't overwrite each other. If two people change the same row, the last save wins.
- The database checks roles on every write: staff can only change counts and the
  waste log, even if someone edits the app's code in their browser.
- `supabase/schema.test.ts` runs the schema in a real Postgres (PGlite) and checks
  those rules on every `npm test`.

## Invoice copies to owners (`invoice-copy` function)

When someone scans an invoice, a copy (details plus the photos) is emailed to the place's
owners. It sends through Resend, like feedback, but to people outside Agave, so it needs a
domain you own, verified in Resend:

1. Buy a domain (getagaveapp.com or similar), then in resend.com > Domains, add it and put
   the DNS records Resend shows into your domain's settings.
2. Supabase > Edge Functions > Secrets: add `INVOICE_FROM` = `Agave <invoices@yourdomain.com>`
3. Deploy: `npx supabase functions deploy invoice-copy --remote=<project ref> --use-api`

Until `INVOICE_FROM` is set, the function sends nothing and scanning works as usual.

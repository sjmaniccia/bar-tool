# Connecting Square

This turns on the **Connect Square** button on the Sales page. After a bar connects,
each day's sales come in by themselves, matched to recipes, with no CSV uploads.
Everything here is free. Start in **Sandbox** (Square's practice mode with fake sales).

You'll need your Supabase project ID: it's the part before `.supabase.co` in your
`VITE_SUPABASE_URL` (for example `vqzfshvnawcmifkzbrey`). Below it's written `YOUR-REF`.

## 1. Add the tables (Supabase, 1 minute)

Supabase → **SQL Editor** → New query → paste all of `supabase/pos.sql` → **Run**.
You should see "Success. No rows returned." (It may warn about "destructive operations"
because of the `revoke` lines; those take access away, so it's safe.)

## 2. Set up the Square app (Square, 5 minutes)

On [developer.squareup.com](https://developer.squareup.com), open your **Agave** app, keep **Sandbox** selected at the top, and:

1. **OAuth** page → **Redirect URL**: `https://YOUR-REF.supabase.co/functions/v1/square` → Save.
2. On the same page, copy the **Sandbox Application ID** and **Sandbox Application secret**.
3. **Sandbox test accounts** (left side, or the Developer Console home) → next to the
   default test account, click **Open in Square Dashboard**. Keep that tab open: Square's
   sandbox only shows the approval page if a test seller is logged in in the same browser.

## 3. Give the server the Square keys (Supabase, 2 minutes)

Supabase → **Edge Functions** → **Secrets** (sometimes under "Manage secrets") → add:

| Name | Value |
| --- | --- |
| `SQUARE_ENV` | `sandbox` |
| `SQUARE_APP_ID` | the Sandbox Application ID |
| `SQUARE_APP_SECRET` | the Sandbox Application secret |
| `APP_URLS` | `https://sjmaniccia.github.io/bar-tool/,http://localhost:5173/` |

These stay on the server. Never put them in `.env.local` or GitHub.

## 4. Put the function online (Terminal, 3 minutes)

From the `bar-tool` folder:

```
npx supabase login
```
(A browser opens; approve it.) Then:

```
npx supabase functions deploy square --project-ref YOUR-REF --use-api --no-verify-jwt
```

It should end with "Deployed Functions on project YOUR-REF: square".
`--no-verify-jwt` is needed because Square's redirect can't sign in; the function checks
who's calling on every other request itself (owners and managers only).

## 5. Make some test sales (Terminal, 1 minute)

Square → your app → **Credentials** → copy the **Sandbox access token**. Then:

```
SQUARE_SANDBOX_TOKEN=paste-it-here node supabase/square-test-sales.mjs
```

It rings up 5 fake sales (Daiquiris, Margaritas, Lager Pints) with Square's test card.

## 6. Connect and sync (Agave)

1. Open Agave (localhost:5173 or the live site), signed in as an owner or manager.
2. **Sales** → **Connect Square** → approve on Square's page → you land back on Sales.
3. It syncs right away: a report per day appears, "Square 2026-11-21", with today so far.
   **Sync now** fetches again; it also syncs by itself when you open Sales (at most hourly).

## Going live with a real Square account later

Repeat steps 2 and 3 with the **Production** application ID and secret, set
`SQUARE_ENV` to `production`, and deploy again (step 4). Real bars then click
**Connect Square** and approve with their own Square login.

## If something goes wrong

- **"Couldn't reach the Square connection"**: the function isn't deployed (step 4), or the secrets are missing (step 3).
- **Square shows an error page instead of "Allow"** (sandbox): open the test account's dashboard first (step 2.3), in the same browser.
- **"That page isn't on the list of Agave addresses"**: the address you're using isn't in `APP_URLS`. Add it, including the trailing `/`.
- **Anything else**: Supabase → Edge Functions → **square** → **Logs** shows what went wrong.

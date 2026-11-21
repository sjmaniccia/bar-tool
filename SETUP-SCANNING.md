# Invoice scanning setup

Managers take photos of a paper invoice. Claude reads them, and Agave matches each
line to your products. About 15 minutes to set up, one time.

How it works:

```
phone photo -> Agave (shrinks it) -> scan-invoice function (Supabase) -> Claude reads it
            <- lines as data      <-  checks the math, adds warnings  <-
Agave matches lines to products -> you check them -> Create invoice -> Approve (prices update)
```

The Anthropic key lives only in Supabase, the same way the Square secret does.

Cost: Claude Haiku 5.5, about a tenth of a cent per page. 1,000 invoices is roughly $1.

Two things keep the bill from running away:

- **Scan limits per bar**: 20 scans a day and 300 a month. The server checks the limit
  *before* sending anything to Claude, so a blocked scan costs nothing. If Claude is down
  or refuses a request (not billed), the scan is given back.
- **The Anthropic spend limit** (step 1): a hard cap on the whole account, in case of anything else.

## 1. Get an Anthropic API key (5 minutes)

1. Go to **console.anthropic.com** and sign up. It may forward you to platform.claude.com, which is the same place.
2. **Billing**: add a card and buy the smallest credit amount ($5 lasts thousands of scans).
3. **Limits**: set a monthly spend limit, like $10. A bug or a bad actor can then never cost more than that.
4. **API Keys** > **Create Key**. Name it `agave-scan-invoice` and copy it. It starts with `sk-ant-`.

The key is shown only once. Paste it straight into Supabase (step 3). Don't paste it in
chat, `.env.local`, GitHub, or a note.

## 2. Add the scan limits to the database (1 minute)

Supabase dashboard > **SQL Editor** > New query. Open `supabase/scanning.sql` in VS Code,
copy all of it, paste it in, and click **Run**. It should say "Success. No rows returned".

To give one bar more scans later (say, when it's on a paid plan), the instructions are at
the top of that file. Only you can do that, from the SQL Editor: bar owners can't raise
their own limits.

## 3. Give the key to Supabase (2 minutes)

Supabase dashboard > your project > **Edge Functions** > **Secrets** > Add new secret:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | the `sk-ant-...` key |

As with the Square secret, Supabase shows only part of it after saving. That's normal.

## 4. Put the function online (Terminal, 2 minutes)

From the `bar-tool` folder (you're already logged in from the Square setup):

```
npx supabase functions deploy scan-invoice --remote=YOUR-REF --use-api
```

It should end with "Deployed Functions on project YOUR-REF: scan-invoice".
This one keeps Supabase's sign-in check on (no `--no-verify-jwt`): only signed-in users
can reach it, and the function then lets only owners and managers in.

## 5. Push the app and try it

```
git add -A
git commit -m "Add invoice photo scanning"
git push
```

When GitHub Actions finishes: **Invoices** > **📷 Scan invoice** > take a photo > **Read invoice**.

Starting a bar from scratch? On the check screen, **+ Add N as new products** turns every
unmatched line into a product (name, bottle size, case size, price) and adds the vendor
if it's new. A few invoices fill in most of a bar's product list.

The first invoice from a vendor needs the most checking. Every match you make is
remembered for that vendor (by item code, or by the line's words), so the next invoice
from them is mostly matched already.

Tips for good photos:

- Flat on the bar, in good light, the whole page in the frame
- One photo per page, up to 4 pages
- A PDF invoice: take a screenshot of each page and scan those

## If something's off

- **"Invoice scanning isn't set up yet"**: the `ANTHROPIC_API_KEY` secret is missing (step 3).
- **"Couldn't reach the scanner"**: the function isn't deployed (step 4).
- **"Scan limits aren't set up yet"**: run `scanning.sql` (step 2).
- **"This bar has used its ... scans"**: the limit did its job. Type the invoice in, or raise that bar's limit (step 2).
- **"Claude couldn't read the invoice: ..."**: often out of credit, or the key was deleted. Check Billing in the Anthropic console.
- **Lines look wrong**: Supabase > Edge Functions > scan-invoice > **Logs** shows each call.

What's not built yet (FIXME): saving the photos with the invoice, and credits/returns as
negative lines (they're listed but skipped for now).

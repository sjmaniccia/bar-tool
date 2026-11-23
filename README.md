# Agave

Recipe costing and inventory for bars, kitchens and breweries. (Repo: bar-tool)

Recipe costing and inventory for bars, kitchens and breweries, built by a former bar manager.

## What it does
- Costs recipes from real vendor prices, down to the fraction of an ounce
- Prep recipes (fresh lime juice, simple syrup) feed into cocktails, with their labor
- Compares vendors: the same bottle as a single or by the case, from different distributors
- Unit conversions, including per-ingredient ones (1 lemon = 1/4 lb)
- Product library: product → format → purchase unit, like a real ordering workflow
- Variance: imports POS sales (any CSV), then shows what was sold vs what was used, in dollars
- Waste log, and alerts when a new invoice price pushes a recipe over its target cost
- Training: flashcards and quizzes built from the bar's own specs, plus a classic cocktail library
- Faster counts: tap a bottle drawing for open bottles, scan barcodes with a scanner or the camera
- Backup and restore, CSV exports, and a products spreadsheet import
- Installable and works offline (a walk-in cooler has no Wi-Fi)
- Accounts and teams (Supabase): owner, manager and staff roles enforced by the database,
  syncing between devices with offline changes sent when the connection is back
- Square connection: daily sales come in by themselves (a Supabase Edge Function holds the keys)
- Invoice scanning: photograph an invoice, confirm the total, and lines match to your products (or go on as charges); matches are remembered per vendor
- Recipe scanning: photograph a recipe book, check the recipes, save them all at once

## Built with
React 19, TypeScript 7, Vite 8, React Router 8, Vitest. Supabase (Postgres, Auth, Realtime)
with Row Level Security. Deployed to GitHub Pages with GitHub Actions.

Accounts are optional: see [SETUP-SUPABASE.md](SETUP-SUPABASE.md). Square: [SETUP-SQUARE.md](SETUP-SQUARE.md). Invoice scanning: [SETUP-SCANNING.md](SETUP-SCANNING.md). Without them, Agave runs
entirely in the browser.

## Running it locally
Needs Node.js 22.22 or newer.

```
npm install      # once, downloads the packages
npm run dev      # opens a live-reloading copy at http://localhost:5173
npm test         # runs the costing tests
npm run build    # type-checks and builds the site into dist/
```

## Project layout
```
src/
  data/          all data and math, no screens
    types.ts       the shape of every table (matches the ERD)
    storage.ts     saving, loading, upgrading old saves
    costing.ts     every cost calculation
    actions.ts     recipe changes
    library.ts     products, formats, ways to buy, prices, vendors, ingredients
    inventory.ts   storage areas, stock counts, on hand, inventory value
    purchasing.ts  orders, suggestions from pars, invoices, approving prices
    menus.ts       menus and their averages
    usage.ts       turns sales into bottles used (follows preps and sub-recipes)
    variance.ts    sales imports, POS matching, waste log, the variance report
    alerts.ts      over-target recipes, invoice price impact, shortages
    csv.ts         reading and writing CSV files
    backup.ts      backup/restore, exports, products spreadsheet import
    training.ts    flashcards and quiz questions
    classics.ts    the classic cocktail library
    units.ts, prices.ts, utils.ts, sampleData.ts
    *.test.ts      the tests
  cloud/         accounts and syncing
    client.ts      the Supabase connection
    session.ts     sign in/out, which bar is open
    sync.ts        sends changes up, applies changes from other devices
    records.ts     the diff/merge math (tested without a network)
    access.ts      which pages each role can open
    pos.ts         Square connect / sync from the app's side
    scan.ts        shrinks photos and sends them to the scanners
    team.ts        members and invites
  components/    pieces of screens (layout, inputs, status badges, recipe sections)
  pages/         one file per screen
supabase/
  schema.sql       tables, roles and Row Level Security (run once in Supabase)
  schema.test.ts   checks the security rules in a real Postgres (PGlite)
  pos.sql          POS connection tables (keys readable only by the server)
  functions/square the Square server function (connect, sync, disconnect)
  functions/scan-invoice  reads invoice photos with Claude (holds the Anthropic key)
  functions/scan-recipes  reads recipe book pages with Claude
  recipe-scanning.sql  recipe page limits (150 a day, 600 a month by default)
  scanning.sql     scan limits per bar (20 a day, 300 a month by default)
  square-test-sales.mjs  rings up fake sales in Square's sandbox
```

## Status
- ✅ Recipes: list, detail page, costing summary, labor, ingredients table
- ✅ Products library: families, formats, ways to buy, price history, pars
- ✅ Ingredients (sources, house choice, conversions) and Vendors (company, rep, ordering)
- ✅ Stock counts: storage areas, cases + loose units, inventory value
- ✅ Ordering from pars, receiving into invoices, approving invoices updates prices
- ✅ Menus with average cost and profit, printable spec book
- ✅ Sales import, POS matching, variance report, waste log, cost alerts
- ✅ Training (flashcards, quiz, tasting notes) and a classics library
- ✅ Open-bottle picker, barcode scanning, backup/export/import, installable offline app
- ✅ Accounts, teams with owner/manager/staff roles, multi-device sync, offline changes
- ✅ Square connection with daily sales sync
- ✅ Invoice photo scanning with remembered matches, charges and a total check
- ✅ Recipe book scanning
- 🔜 Toast connection, invite emails, hiding costs from staff screens
- 🔜 Invoice photo scanning

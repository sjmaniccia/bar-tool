# Proof

Recipe costing and inventory for bars, kitchens and breweries. (Repo: bar-tool)

Recipe costing and inventory for bars, kitchens and breweries, built by a former bar manager.

## What it does
- Costs recipes from real vendor prices, down to the fraction of an ounce
- Prep recipes (fresh lime juice, simple syrup) feed into cocktails, with their labor
- Compares vendors: the same bottle as a single or by the case, from different distributors
- Unit conversions, including per-ingredient ones (1 lemon = 1/4 lb)
- Product library: product → format → purchase unit, like a real ordering workflow

## Built with
React 19, TypeScript 7, Vite 8, React Router 8, Vitest. Deployed to GitHub Pages with GitHub Actions.

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
    units.ts, prices.ts, utils.ts, sampleData.ts
    costing.test.ts, operations.test.ts
  components/    pieces of screens (layout, inputs, status badges, recipe sections)
  pages/         one file per screen
```

## Status
- ✅ Recipes: list, detail page, costing summary, labor, ingredients table
- ✅ Products library: families, formats, ways to buy, price history, pars
- ✅ Ingredients (sources, house choice, conversions) and Vendors (company, rep, ordering)
- ✅ Stock counts: storage areas, cases + loose units, inventory value
- ✅ Ordering from pars, receiving into invoices, approving invoices updates prices
- ✅ Menus with average cost and profit, printable spec book
- 🔜 Accounts, staff roles and a shared database (data lives in one browser for now)
- 🔜 Phone app, invoice scanning

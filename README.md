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
    actions.ts     every change the screens can make
    units.ts, prices.ts, utils.ts
    costing.test.ts
  components/    pieces of screens (layout, inputs, recipe sections)
  pages/         one file per screen
public/legacy/   the original screens, still used for Products, Ingredients and Vendors
```

## Status
- ✅ Recipes: list, detail page, costing summary, labor, ingredients table
- 🔜 Products, Ingredients, Vendors: being rebuilt (the classic screens work meanwhile)
- 🔜 Ordering, invoices, stock counts, menus

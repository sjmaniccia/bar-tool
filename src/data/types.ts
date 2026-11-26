// ===== types.ts =====
// The shape of every table, matching the ERD.
// TypeScript checks every use of these against this file, so a typo like
// recipe.yeildAmount is caught in the editor before the app ever runs.
// `string | null` means "a string, or null when there isn't one".

export interface Vendor {
    id: string;
    companyName: string;
    companyPhone: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    repName: string;
    repPhone: string;
    repEmail: string;
    orderDays: string;     // "Tue & Fri", when they deliver
    notes: string;
}

// What a recipe asks for ("Vodka", "Lime juice")
export interface Ingredient {
    id: string;
    name: string;
    housePurchaseUnitId: string | null;   // the bar's chosen way to buy it...
    houseRecipeId: string | null;         // ...or the in-house recipe that makes it
}

// e.g. Lemon: 1 each = 0.25 lb
export interface IngredientConversion {
    id: string;
    ingredientId: string;
    fromAmount: number;
    fromUnit: string;
    toAmount: number;
    toUnit: string;
}

// WHAT it is: "Tito's Handmade Vodka"
export interface Product {
    id: string;
    ingredientId: string | null;
    name: string;
    family: string;
    category: string;
    subcategory: string;
    producer: string;
    abv: number | null;
    notes: string;          // tasting notes and talking points for staff
}

// HOW it's packed: a 1.75 L bottle (inventory is counted in these)
export interface Format {
    id: string;
    productId: string;
    unitSize: number;
    sizeUnit: string;
    packaging: string;
    yieldPercent: number;
    par: number | null;    // how many of these (bottles, bags...) to keep on hand
    barcode: string;       // UPC on the bottle, for scanning during counts
}

// HOW you buy it: a case of 6 from RNDC (orders and prices use these)
export interface PurchaseUnit {
    id: string;
    formatId: string;
    vendorId: string | null;
    name: string;
    unitAmount: number;
    sku: string;
}

export interface PriceEntry {
    id: string;
    purchaseUnitId: string;
    amount: number;
    recordedAt: string;   // "2026-11-18T20:27:03.123Z" or "2026-11-10"
}

export type RecipeType = "Cocktail" | "Dish" | "Beer" | "Prep";

export interface Recipe {
    id: string;
    name: string;
    type: RecipeType;
    yieldAmount: number;
    yieldUnit: string;
    menuPrice: number | null;             // per serving; null = not sold
    producesIngredientId: string | null;  // the ingredient this prep recipe makes
    laborWage: number | null;             // $ per hour
    laborMinutes: number | null;          // minutes to make one batch
    glass: string;
    garnish: string;
    description: string;                  // the story behind it, for staff
    directions: string;                   // how to make it
    photo: string;                        // a picture of it: a web address, or "" for none
    createdBy: string;                    // who put it in (an account id), "" = before accounts or unknown
}

// One ingredient line: uses an ingredient OR a sub-recipe
export interface RecipeLine {
    id: string;
    recipeId: string;
    ingredientId: string | null;
    subRecipeId: string | null;
    choicePurchaseUnitId: string | null;  // overrides the house choice...
    choiceRecipeId: string | null;        // ...with a purchase unit or an in-house recipe
    amount: number;
    unit: string;               // "each" = a count: shown as "2 onions", never "2 each onions"
    countWord: string;          // what's counted, as written: "clove" (3 cloves garlic), "can"; "" = the thing itself
    note: string;               // as written after it: "chopped", "to taste"; "" = none
}

// ===== Stock counts =====

// How a place uses Agave (one row, id "place"; no row = the defaults)
//     recipesOnly: a family's or home cook's recipes, with every costing, stock
//     and sales part hidden. Turning it off later loses nothing.
export interface PlaceSettings {
    id: string;
    recipesOnly: boolean;
}

// Where things are kept: "Back bar", "Walk-in"
export interface Area {
    id: string;
    name: string;
}

export type CountStatus = "open" | "closed";

// One stock count (usually weekly or monthly)
export interface StockCount {
    id: string;
    name: string;
    countedAt: string;
    status: CountStatus;
}

// How much of one format is in one area: whole cases + loose units (bottles can be 0.3)
export interface CountLine {
    id: string;
    countId: string;
    areaId: string | null;
    formatId: string;
    cases: number;
    units: number;
}


// ===== Purchasing =====

export type OrderStatus = "draft" | "sent" | "received";

export interface Order {
    id: string;
    vendorId: string;
    status: OrderStatus;
    createdAt: string;
    note: string;
}

export interface OrderLine {
    id: string;
    orderId: string;
    purchaseUnitId: string;
    quantity: number;
}

// unreconciled = just entered, reconciled = checked against the delivery, approved = prices recorded
export type InvoiceStatus = "unreconciled" | "reconciled" | "approved";

export interface Invoice {
    id: string;
    vendorId: string;
    orderId: string | null;
    number: string;
    invoiceDate: string;
    status: InvoiceStatus;
    note: string;
}

export interface InvoiceLine {
    id: string;
    invoiceId: string;
    purchaseUnitId: string;
    quantity: number;
    unitPrice: number;     // price per purchase unit on the paper invoice
}

// Money on an invoice that isn't a product: delivery, fuel, deposits, a subscription,
// a split-case fee. A credit (a return, a refund) is a negative amount.
export interface InvoiceCharge {
    id: string;
    invoiceId: string;
    description: string;
    amount: number;
}


// ===== Sales (from the POS) =====

// One uploaded sales report covering a stretch of days
export interface SalesImport {
    id: string;
    name: string;          // the file name
    startDate: string;     // first day the report covers
    endDate: string;       // last day it covers
    importedAt: string;
}

// One item from the report: "Daiquiri, 214 sold, $2,354"
export interface SalesLine {
    id: string;
    importId: string;
    itemName: string;      // as the POS spells it
    quantity: number;
    revenue: number;
    recipeId: string | null;   // matched recipe, null = not matched (or ignored)
}

// Remembers how a POS item name matches a recipe, so the next import matches itself
//     recipeId null + ignored = "not a drink we track" (gift cards, merch...)
export interface PosLink {
    id: string;
    posName: string;       // lowercase, trimmed
    recipeId: string | null;
    ignored: boolean;
}


// Remembers which product a supplier's invoice line is, so the next scan matches itself
//     key = "sku:10432" when the invoice prints an item code, else "desc:island white rum 12 1l"
//     asCharge = this line is a charge, not a product (a subscription, a service fee)
export interface InvoiceItemLink {
    id: string;
    vendorId: string;
    key: string;
    purchaseUnitId: string;    // "" when asCharge
    asCharge?: boolean;
}


// ===== Waste =====

export type WasteReason = "spill" | "comp" | "breakage" | "expired" | "returned" | "other";

// Something used up without being sold: a broken bottle, a comped drink
//     product: units of a format (0.5 bottle)
//     recipe:  servings of a recipe (2 Daiquiris comped)
export interface WasteEntry {
    id: string;
    date: string;
    kind: "product" | "recipe";
    formatId: string | null;
    recipeId: string | null;
    quantity: number;
    reason: WasteReason;
    note: string;
}


// ===== Menus =====

export interface Menu {
    id: string;
    name: string;
    description: string;
}

export interface MenuItem {
    id: string;
    menuId: string;
    recipeId: string;
    sortOrder: number;
}


// Every table together
export interface Database {
    vendors: Vendor[];
    ingredients: Ingredient[];
    ingredientConversions: IngredientConversion[];
    products: Product[];
    formats: Format[];
    purchaseUnits: PurchaseUnit[];
    priceEntries: PriceEntry[];
    recipes: Recipe[];
    recipeLines: RecipeLine[];
    areas: Area[];
    stockCounts: StockCount[];
    countLines: CountLine[];
    orders: Order[];
    orderLines: OrderLine[];
    invoices: Invoice[];
    invoiceLines: InvoiceLine[];
    invoiceCharges: InvoiceCharge[];
    menus: Menu[];
    menuItems: MenuItem[];
    salesImports: SalesImport[];
    salesLines: SalesLine[];
    posLinks: PosLink[];
    invoiceItemLinks: InvoiceItemLink[];
    wasteEntries: WasteEntry[];
    placeSettings: PlaceSettings[];
}

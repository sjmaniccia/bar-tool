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
    unit: string;
}

// ===== Stock counts =====

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
    menus: Menu[];
    menuItems: MenuItem[];
}

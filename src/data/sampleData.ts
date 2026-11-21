// ===== sampleData.ts =====
// A small made-up bar for trying the app: products with prices, two in-house
// preps (fresh lime juice, simple syrup), two cocktails that use them, storage
// areas with a finished stock count (some things are below par), and a menu.
// Loaded from the Dashboard with "Load sample data".

import type { Database, Recipe } from "./types";

const DATE = "2026-11-01";

function recipe(fields: Partial<Recipe> & Pick<Recipe, "id" | "name">): Recipe {
    return {
        type: "Cocktail", yieldAmount: 1, yieldUnit: "serving", menuPrice: null,
        producesIngredientId: null, laborWage: null, laborMinutes: null,
        glass: "", garnish: "", description: "", directions: "",
        ...fields
    };
}

export function sampleData(): Database {
    return {
        vendors: [
            {
                id: "v-sg", companyName: "Southern Glazer's", companyPhone: "(423) 555-0142", street: "1200 Riverside Dr", city: "Chattanooga", state: "TN", zip: "37406",
                repName: "Dana Brooks", repPhone: "(423) 555-0187", repEmail: "dana.brooks@example.com", orderDays: "Order by Mon, delivers Wed", notes: ""
            },
            {
                id: "v-rndc", companyName: "RNDC", companyPhone: "(423) 555-0110", street: "88 Industrial Blvd", city: "Ringgold", state: "GA", zip: "30736",
                repName: "Marcus Hale", repPhone: "(423) 555-0133", repEmail: "marcus.hale@example.com", orderDays: "Order by Tue, delivers Thu", notes: "Case discounts on tequila over 3 cases"
            },
            {
                id: "v-produce", companyName: "Valley Produce", companyPhone: "(423) 555-0199", street: "410 Market St", city: "Chattanooga", state: "TN", zip: "37402",
                repName: "Rosa Diaz", repPhone: "(423) 555-0164", repEmail: "", orderDays: "Daily before 2 pm", notes: ""
            }
        ],
        ingredients: [
            { id: "i-rum", name: "White rum", housePurchaseUnitId: "pu-rum-case", houseRecipeId: null },
            { id: "i-tequila", name: "Blanco tequila", housePurchaseUnitId: null, houseRecipeId: null },
            { id: "i-orange", name: "Orange liqueur", housePurchaseUnitId: null, houseRecipeId: null },
            { id: "i-lime", name: "Lime", housePurchaseUnitId: null, houseRecipeId: null },
            { id: "i-sugar", name: "Sugar", housePurchaseUnitId: null, houseRecipeId: null },
            { id: "i-limejuice", name: "Lime juice", housePurchaseUnitId: null, houseRecipeId: "r-limejuice" },
            { id: "i-syrup", name: "Simple syrup", housePurchaseUnitId: null, houseRecipeId: null },
            { id: "i-lager", name: "Lager", housePurchaseUnitId: null, houseRecipeId: null }
        ],
        ingredientConversions: [],
        products: [
            { id: "p-rum", ingredientId: "i-rum", name: "Island White Rum", family: "Spirits", category: "Rum", subcategory: "White", producer: "", abv: 40, notes: "Light and clean, with a little vanilla and cut grass. Our well rum." },
            { id: "p-tequila", ingredientId: "i-tequila", name: "Highland Blanco Tequila", family: "Spirits", category: "Tequila", subcategory: "Blanco", producer: "", abv: 40, notes: "100% agave from the highlands. Bright citrus and black pepper, a little sweet cooked agave." },
            { id: "p-orange", ingredientId: "i-orange", name: "Triple Orange Liqueur", family: "Spirits", category: "Liqueur", subcategory: "", producer: "", abv: 30, notes: "Dry orange peel liqueur. Sweet but not syrupy; the orange in our Margarita." },
            { id: "p-lime", ingredientId: "i-lime", name: "Limes", family: "Produce", category: "Citrus", subcategory: "", producer: "", abv: null, notes: "" },
            { id: "p-sugar", ingredientId: "i-sugar", name: "Granulated Sugar", family: "Dry goods", category: "Sweeteners", subcategory: "", producer: "", abv: null, notes: "" },
            { id: "p-limejuice", ingredientId: "i-limejuice", name: "Bottled Lime Juice", family: "Non-alcoholic", category: "Juice", subcategory: "", producer: "", abv: null, notes: "" },
            { id: "p-lager", ingredientId: "i-lager", name: "Lookout Valley Lager", family: "Beer", category: "Lager", subcategory: "Draft", producer: "Lookout Valley Brewing", abv: 4.8, notes: "Local crisp lager: light malt, a little bread crust, clean finish. Brewed 10 minutes away." },
            { id: "p-red", ingredientId: null, name: "House Red Blend", family: "Wine", category: "Red", subcategory: "Blend", producer: "", abv: 13.5, notes: "Soft red blend: ripe cherry and plum, light tannin. Easy with burgers and pizza." }
        ],
        formats: [
            { id: "f-rum", productId: "p-rum", unitSize: 1000, sizeUnit: "ml", packaging: "bottle", yieldPercent: 100, par: 18, barcode: "850001234561" },
            { id: "f-tequila", productId: "p-tequila", unitSize: 750, sizeUnit: "ml", packaging: "bottle", yieldPercent: 100, par: 12, barcode: "" },
            { id: "f-orange", productId: "p-orange", unitSize: 750, sizeUnit: "ml", packaging: "bottle", yieldPercent: 100, par: 6, barcode: "" },
            { id: "f-lime", productId: "p-lime", unitSize: 1, sizeUnit: "each", packaging: "lime", yieldPercent: 100, par: 200, barcode: "" },
            { id: "f-sugar", productId: "p-sugar", unitSize: 4, sizeUnit: "lb", packaging: "bag", yieldPercent: 100, par: 6, barcode: "" },
            { id: "f-limejuice", productId: "p-limejuice", unitSize: 1, sizeUnit: "L", packaging: "bottle", yieldPercent: 100, par: 6, barcode: "" },
            { id: "f-lager", productId: "p-lager", unitSize: 0.5, sizeUnit: "barrel", packaging: "keg", yieldPercent: 95, par: 2, barcode: "" },
            { id: "f-red", productId: "p-red", unitSize: 750, sizeUnit: "ml", packaging: "bottle", yieldPercent: 100, par: 12, barcode: "" }
        ],
        purchaseUnits: [
            { id: "pu-rum-case", formatId: "f-rum", vendorId: "v-sg", name: "case", unitAmount: 12, sku: "" },
            { id: "pu-rum-single", formatId: "f-rum", vendorId: "v-rndc", name: "single", unitAmount: 1, sku: "" },
            { id: "pu-tequila", formatId: "f-tequila", vendorId: "v-rndc", name: "case", unitAmount: 12, sku: "" },
            { id: "pu-orange", formatId: "f-orange", vendorId: "v-sg", name: "case", unitAmount: 6, sku: "" },
            { id: "pu-lime", formatId: "f-lime", vendorId: "v-produce", name: "case", unitAmount: 200, sku: "" },
            { id: "pu-sugar", formatId: "f-sugar", vendorId: "v-produce", name: "case", unitAmount: 6, sku: "" },
            { id: "pu-limejuice", formatId: "f-limejuice", vendorId: "v-rndc", name: "case", unitAmount: 6, sku: "" },
            { id: "pu-lager", formatId: "f-lager", vendorId: "v-sg", name: "keg", unitAmount: 1, sku: "LVL-HALF" },
            { id: "pu-red", formatId: "f-red", vendorId: "v-sg", name: "case", unitAmount: 12, sku: "" }
        ],
        priceEntries: [
            { id: "pe-1", purchaseUnitId: "pu-rum-case", amount: 210, recordedAt: DATE },
            { id: "pe-2", purchaseUnitId: "pu-rum-single", amount: 19.5, recordedAt: DATE },
            { id: "pe-3", purchaseUnitId: "pu-tequila", amount: 300, recordedAt: DATE },
            { id: "pe-4", purchaseUnitId: "pu-orange", amount: 96, recordedAt: DATE },
            { id: "pe-5", purchaseUnitId: "pu-lime", amount: 40, recordedAt: DATE },
            { id: "pe-6", purchaseUnitId: "pu-sugar", amount: 18, recordedAt: DATE },
            { id: "pe-7", purchaseUnitId: "pu-limejuice", amount: 48, recordedAt: DATE },
            { id: "pe-8", purchaseUnitId: "pu-lager", amount: 165, recordedAt: DATE },
            { id: "pe-9", purchaseUnitId: "pu-red", amount: 108, recordedAt: DATE },
            { id: "pe-10", purchaseUnitId: "pu-rum-case", amount: 204, recordedAt: "2026-10-01" }
        ],
        recipes: [
            recipe({
                id: "r-limejuice", name: "Fresh Lime Juice", type: "Prep",
                yieldAmount: 8, yieldUnit: "fl oz", producesIngredientId: "i-limejuice",
                laborWage: 20, laborMinutes: 10,
                directions: "Roll limes on the counter, halve, and press. Strain out seeds. Keeps 24 hours."
            }),
            recipe({
                id: "r-syrup", name: "Simple Syrup", type: "Prep",
                yieldAmount: 32, yieldUnit: "fl oz", producesIngredientId: "i-syrup",
                laborWage: 20, laborMinutes: 5,
                directions: "Stir equal parts sugar and hot water until dissolved. Cool before using."
            }),
            recipe({
                id: "r-daiquiri", name: "Daiquiri", menuPrice: 11, laborWage: 20, laborMinutes: 1,
                glass: "Coupe", garnish: "Lime wheel",
                description: "A Cuban classic: rum, lime and sugar, nothing to hide behind.",
                directions: "Add everything to a shaker with ice. Shake hard. Double strain into a chilled coupe."
            }),
            recipe({
                id: "r-margarita", name: "Margarita", menuPrice: 12, laborWage: 20, laborMinutes: 1,
                glass: "Rocks", garnish: "Salt rim, lime wheel",
                directions: "Shake with ice and strain over fresh ice into a salt-rimmed rocks glass."
            }),
            recipe({
                id: "r-lager", name: "Lager Pint", type: "Beer", menuPrice: 6, laborWage: null, laborMinutes: null,
                glass: "Pint", garnish: "",
                directions: "Pour at a 45-degree angle, straighten for the last third to leave a one-inch head."
            })
        ],
        recipeLines: [
            { id: "l-1", recipeId: "r-limejuice", ingredientId: "i-lime", subRecipeId: null, choicePurchaseUnitId: null, choiceRecipeId: null, amount: 10, unit: "each" },
            { id: "l-2", recipeId: "r-syrup", ingredientId: "i-sugar", subRecipeId: null, choicePurchaseUnitId: null, choiceRecipeId: null, amount: 2, unit: "lb" },
            { id: "l-3", recipeId: "r-daiquiri", ingredientId: "i-rum", subRecipeId: null, choicePurchaseUnitId: null, choiceRecipeId: null, amount: 2, unit: "fl oz" },
            { id: "l-4", recipeId: "r-daiquiri", ingredientId: "i-limejuice", subRecipeId: null, choicePurchaseUnitId: null, choiceRecipeId: null, amount: 1, unit: "fl oz" },
            { id: "l-5", recipeId: "r-daiquiri", ingredientId: "i-syrup", subRecipeId: null, choicePurchaseUnitId: null, choiceRecipeId: null, amount: 0.75, unit: "fl oz" },
            { id: "l-6", recipeId: "r-margarita", ingredientId: "i-tequila", subRecipeId: null, choicePurchaseUnitId: null, choiceRecipeId: null, amount: 2, unit: "fl oz" },
            { id: "l-7", recipeId: "r-margarita", ingredientId: "i-orange", subRecipeId: null, choicePurchaseUnitId: null, choiceRecipeId: null, amount: 1, unit: "fl oz" },
            { id: "l-8", recipeId: "r-margarita", ingredientId: "i-limejuice", subRecipeId: null, choicePurchaseUnitId: null, choiceRecipeId: null, amount: 1, unit: "fl oz" },
            { id: "l-9", recipeId: "r-margarita", ingredientId: "i-syrup", subRecipeId: null, choicePurchaseUnitId: null, choiceRecipeId: null, amount: 0.5, unit: "fl oz" },
            { id: "l-10", recipeId: "r-lager", ingredientId: "i-lager", subRecipeId: null, choicePurchaseUnitId: null, choiceRecipeId: null, amount: 16, unit: "fl oz" }
        ],
        areas: [
            { id: "a-backbar", name: "Back bar" },
            { id: "a-walkin", name: "Walk-in" },
            { id: "a-dry", name: "Dry storage" }
        ],
        // Two finished counts a week apart, so the variance report has a period to show
        stockCounts: [
            { id: "c-0", name: "Weekly count", countedAt: "2026-11-08", status: "closed" },
            { id: "c-1", name: "Weekly count", countedAt: "2026-11-15", status: "closed" }
        ],
        // Below par on purpose (rum, tequila, orange, limes, sugar) so ordering has suggestions
        countLines: [
            { id: "cl-01", countId: "c-0", areaId: "a-backbar", formatId: "f-rum", cases: 0, units: 6 },
            { id: "cl-02", countId: "c-0", areaId: "a-dry", formatId: "f-rum", cases: 1, units: 0 },
            { id: "cl-03", countId: "c-0", areaId: "a-backbar", formatId: "f-tequila", cases: 0, units: 10 },
            { id: "cl-04", countId: "c-0", areaId: "a-backbar", formatId: "f-orange", cases: 0, units: 7 },
            { id: "cl-05", countId: "c-0", areaId: "a-walkin", formatId: "f-lime", cases: 0, units: 200 },
            { id: "cl-06", countId: "c-0", areaId: "a-dry", formatId: "f-sugar", cases: 0, units: 3 },
            { id: "cl-07", countId: "c-0", areaId: "a-walkin", formatId: "f-limejuice", cases: 1, units: 0 },
            { id: "cl-08", countId: "c-0", areaId: "a-walkin", formatId: "f-lager", cases: 0, units: 3 },
            { id: "cl-09", countId: "c-0", areaId: "a-dry", formatId: "f-red", cases: 1, units: 3 },
            { id: "cl-1", countId: "c-1", areaId: "a-backbar", formatId: "f-rum", cases: 0, units: 3.4 },
            { id: "cl-2", countId: "c-1", areaId: "a-dry", formatId: "f-rum", cases: 1, units: 0 },
            { id: "cl-3", countId: "c-1", areaId: "a-backbar", formatId: "f-tequila", cases: 0, units: 2.5 },
            { id: "cl-4", countId: "c-1", areaId: "a-backbar", formatId: "f-orange", cases: 0, units: 4 },
            { id: "cl-5", countId: "c-1", areaId: "a-walkin", formatId: "f-lime", cases: 0, units: 60 },
            { id: "cl-6", countId: "c-1", areaId: "a-dry", formatId: "f-sugar", cases: 0, units: 5 },
            { id: "cl-7", countId: "c-1", areaId: "a-walkin", formatId: "f-limejuice", cases: 1, units: 0 },
            { id: "cl-8", countId: "c-1", areaId: "a-walkin", formatId: "f-lager", cases: 0, units: 2.4 },
            { id: "cl-9", countId: "c-1", areaId: "a-dry", formatId: "f-red", cases: 1, units: 2 }
        ],
        orders: [],
        orderLines: [],
        // Deliveries between the two counts (already approved, so prices are current)
        invoices: [
            { id: "inv-1", vendorId: "v-sg", orderId: null, number: "SG-47710", invoiceDate: "2026-11-10", status: "approved", note: "" },
            { id: "inv-2", vendorId: "v-rndc", orderId: null, number: "R-88213", invoiceDate: "2026-11-10", status: "approved", note: "" },
            { id: "inv-3", vendorId: "v-produce", orderId: null, number: "", invoiceDate: "2026-11-10", status: "approved", note: "" }
        ],
        invoiceLines: [
            { id: "il-1", invoiceId: "inv-1", purchaseUnitId: "pu-rum-case", quantity: 1, unitPrice: 210 },
            { id: "il-2", invoiceId: "inv-1", purchaseUnitId: "pu-orange", quantity: 1, unitPrice: 96 },
            { id: "il-3", invoiceId: "inv-1", purchaseUnitId: "pu-lager", quantity: 1, unitPrice: 165 },
            { id: "il-4", invoiceId: "inv-2", purchaseUnitId: "pu-tequila", quantity: 1, unitPrice: 300 },
            { id: "il-5", invoiceId: "inv-3", purchaseUnitId: "pu-lime", quantity: 2, unitPrice: 40 },
            { id: "il-6", invoiceId: "inv-3", purchaseUnitId: "pu-sugar", quantity: 1, unitPrice: 18 }
        ],
        menus: [
            { id: "m-fall", name: "Fall Cocktails", description: "The seasonal list on the back of the menu." }
        ],
        menuItems: [
            { id: "mi-1", menuId: "m-fall", recipeId: "r-daiquiri", sortOrder: 1 },
            { id: "mi-2", menuId: "m-fall", recipeId: "r-margarita", sortOrder: 2 }
        ],
        // A week of POS sales: rum comes up short on purpose; the lager and gift card need matching
        salesImports: [
            { id: "s-1", name: "pos-sales-nov-9-15.csv", startDate: "2026-11-09", endDate: "2026-11-15", importedAt: DATE }
        ],
        salesLines: [
            { id: "sl-1", importId: "s-1", itemName: "Daiquiri", quantity: 200, revenue: 2200, recipeId: "r-daiquiri" },
            { id: "sl-2", importId: "s-1", itemName: "Margarita", quantity: 230, revenue: 2760, recipeId: "r-margarita" },
            { id: "sl-3", importId: "s-1", itemName: "Lookout Lager Pint", quantity: 180, revenue: 1080, recipeId: null },
            { id: "sl-4", importId: "s-1", itemName: "Gift Card", quantity: 3, revenue: 75, recipeId: null }
        ],
        posLinks: [],
        invoiceItemLinks: [],
        wasteEntries: [
            { id: "w-1", date: "2026-11-12", kind: "product", formatId: "f-tequila", recipeId: null, quantity: 1, reason: "breakage", note: "Dropped during restock" },
            { id: "w-2", date: "2026-11-14", kind: "recipe", formatId: null, recipeId: "r-daiquiri", quantity: 3, reason: "comp", note: "Birthday table" }
        ]
    };
}

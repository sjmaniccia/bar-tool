// ===== sampleData.ts =====
// A small made-up bar for trying the app: products with prices, two in-house
// preps (fresh lime juice, simple syrup), and two cocktails that use them.
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
            { id: "v-sg", companyName: "Southern Glazer's", companyPhone: "", street: "", city: "Chattanooga", state: "TN", zip: "", repName: "", repPhone: "" },
            { id: "v-rndc", companyName: "RNDC", companyPhone: "", street: "", city: "Chattanooga", state: "TN", zip: "", repName: "", repPhone: "" },
            { id: "v-produce", companyName: "Valley Produce", companyPhone: "", street: "", city: "Chattanooga", state: "TN", zip: "", repName: "", repPhone: "" }
        ],
        ingredients: [
            { id: "i-rum", name: "White rum", housePurchaseUnitId: "pu-rum-case", houseRecipeId: null },
            { id: "i-tequila", name: "Blanco tequila", housePurchaseUnitId: null, houseRecipeId: null },
            { id: "i-orange", name: "Orange liqueur", housePurchaseUnitId: null, houseRecipeId: null },
            { id: "i-lime", name: "Lime", housePurchaseUnitId: null, houseRecipeId: null },
            { id: "i-sugar", name: "Sugar", housePurchaseUnitId: null, houseRecipeId: null },
            { id: "i-limejuice", name: "Lime juice", housePurchaseUnitId: null, houseRecipeId: "r-limejuice" },
            { id: "i-syrup", name: "Simple syrup", housePurchaseUnitId: null, houseRecipeId: null }
        ],
        ingredientConversions: [],
        products: [
            { id: "p-rum", ingredientId: "i-rum", name: "Island White Rum", family: "Spirits", category: "Rum", subcategory: "White", producer: "", abv: 40 },
            { id: "p-tequila", ingredientId: "i-tequila", name: "Highland Blanco Tequila", family: "Spirits", category: "Tequila", subcategory: "Blanco", producer: "", abv: 40 },
            { id: "p-orange", ingredientId: "i-orange", name: "Triple Orange Liqueur", family: "Spirits", category: "Liqueur", subcategory: "", producer: "", abv: 30 },
            { id: "p-lime", ingredientId: "i-lime", name: "Limes", family: "Produce", category: "Citrus", subcategory: "", producer: "", abv: null },
            { id: "p-sugar", ingredientId: "i-sugar", name: "Granulated Sugar", family: "Dry goods", category: "Sweeteners", subcategory: "", producer: "", abv: null },
            { id: "p-limejuice", ingredientId: "i-limejuice", name: "Bottled Lime Juice", family: "Non-alcoholic", category: "Juice", subcategory: "", producer: "", abv: null }
        ],
        formats: [
            { id: "f-rum", productId: "p-rum", unitSize: 1000, sizeUnit: "ml", packaging: "bottle", yieldPercent: 100 },
            { id: "f-tequila", productId: "p-tequila", unitSize: 750, sizeUnit: "ml", packaging: "bottle", yieldPercent: 100 },
            { id: "f-orange", productId: "p-orange", unitSize: 750, sizeUnit: "ml", packaging: "bottle", yieldPercent: 100 },
            { id: "f-lime", productId: "p-lime", unitSize: 1, sizeUnit: "each", packaging: "lime", yieldPercent: 100 },
            { id: "f-sugar", productId: "p-sugar", unitSize: 4, sizeUnit: "lb", packaging: "bag", yieldPercent: 100 },
            { id: "f-limejuice", productId: "p-limejuice", unitSize: 1, sizeUnit: "L", packaging: "bottle", yieldPercent: 100 }
        ],
        purchaseUnits: [
            { id: "pu-rum-case", formatId: "f-rum", vendorId: "v-sg", name: "case", unitAmount: 12, sku: "" },
            { id: "pu-rum-single", formatId: "f-rum", vendorId: "v-rndc", name: "single", unitAmount: 1, sku: "" },
            { id: "pu-tequila", formatId: "f-tequila", vendorId: "v-rndc", name: "case", unitAmount: 12, sku: "" },
            { id: "pu-orange", formatId: "f-orange", vendorId: "v-sg", name: "case", unitAmount: 6, sku: "" },
            { id: "pu-lime", formatId: "f-lime", vendorId: "v-produce", name: "case", unitAmount: 200, sku: "" },
            { id: "pu-sugar", formatId: "f-sugar", vendorId: "v-produce", name: "case", unitAmount: 6, sku: "" },
            { id: "pu-limejuice", formatId: "f-limejuice", vendorId: "v-rndc", name: "case", unitAmount: 6, sku: "" }
        ],
        priceEntries: [
            { id: "pe-1", purchaseUnitId: "pu-rum-case", amount: 210, recordedAt: DATE },
            { id: "pe-2", purchaseUnitId: "pu-rum-single", amount: 19.5, recordedAt: DATE },
            { id: "pe-3", purchaseUnitId: "pu-tequila", amount: 300, recordedAt: DATE },
            { id: "pe-4", purchaseUnitId: "pu-orange", amount: 96, recordedAt: DATE },
            { id: "pe-5", purchaseUnitId: "pu-lime", amount: 40, recordedAt: DATE },
            { id: "pe-6", purchaseUnitId: "pu-sugar", amount: 18, recordedAt: DATE },
            { id: "pe-7", purchaseUnitId: "pu-limejuice", amount: 48, recordedAt: DATE }
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
            { id: "l-9", recipeId: "r-margarita", ingredientId: "i-syrup", subRecipeId: null, choicePurchaseUnitId: null, choiceRecipeId: null, amount: 0.5, unit: "fl oz" }
        ]
    };
}

// ===== classics.ts =====
// A starter library of classic cocktail specs, so a new bar doesn't type them all in.
// "Add to my recipes" copies one into the bar's own recipes, where it gets costed
// and can be changed to the house spec.
//
// Ingredient names match the sample bar ("White rum", "Lime juice", "Simple syrup")
// so adding a classic reuses ingredients a bar already has instead of making copies.
// Specs are common modern versions; every bar tweaks them.

import { db, commit } from "./storage";
import { getOrCreateIngredient } from "./actions";
import { makeId } from "./utils";
import type { Recipe } from "./types";

export type ClassicStyle = "Spirit-forward" | "Sour" | "Highball" | "Tiki" | "Sparkling" | "Brunch & after dinner";

export interface Classic {
    name: string;
    style: ClassicStyle;
    glass: string;
    garnish: string;
    build: [number, string, string][];   // [amount, unit, ingredient]
    directions: string;
    description: string;
}

export const CLASSICS: Classic[] = [
    // ===== Spirit-forward =====
    {
        name: "Old Fashioned", style: "Spirit-forward", glass: "Rocks", garnish: "Orange peel",
        build: [[2, "fl oz", "Bourbon"], [0.25, "fl oz", "Demerara syrup"], [2, "dash", "Angostura bitters"], [1, "dash", "Orange bitters"]],
        directions: "Stir with ice until cold. Strain over one large cube. Express the orange peel over the top.",
        description: "Spirit, sugar, bitters, water: the original definition of a cocktail."
    },
    {
        name: "Manhattan", style: "Spirit-forward", glass: "Coupe", garnish: "Brandied cherry",
        build: [[2, "fl oz", "Rye whiskey"], [1, "fl oz", "Sweet vermouth"], [2, "dash", "Angostura bitters"]],
        directions: "Stir with ice until cold. Strain into a chilled coupe.",
        description: "Rye and sweet vermouth. Ask if they'd like it with bourbon instead."
    },
    {
        name: "Martini", style: "Spirit-forward", glass: "Nick & Nora", garnish: "Lemon twist or olive",
        build: [[2.5, "fl oz", "London dry gin"], [0.5, "fl oz", "Dry vermouth"], [1, "dash", "Orange bitters"]],
        directions: "Stir with ice until very cold. Strain into a chilled glass. Ask: twist or olive?",
        description: "Ask three things: gin or vodka, how dry, twist or olive."
    },
    {
        name: "Negroni", style: "Spirit-forward", glass: "Rocks", garnish: "Orange peel",
        build: [[1, "fl oz", "London dry gin"], [1, "fl oz", "Campari"], [1, "fl oz", "Sweet vermouth"]],
        directions: "Stir with ice. Strain over one large cube. Garnish with an orange peel.",
        description: "Equal parts gin, Campari and sweet vermouth. Bitter, sweet and strong."
    },
    {
        name: "Boulevardier", style: "Spirit-forward", glass: "Rocks", garnish: "Orange peel",
        build: [[1.5, "fl oz", "Bourbon"], [1, "fl oz", "Campari"], [1, "fl oz", "Sweet vermouth"]],
        directions: "Stir with ice. Strain over one large cube or up into a coupe.",
        description: "A Negroni with bourbon in place of gin. Rounder and warmer."
    },
    {
        name: "Sazerac", style: "Spirit-forward", glass: "Rocks (no ice)", garnish: "Lemon peel, discarded",
        build: [[2, "fl oz", "Rye whiskey"], [0.25, "fl oz", "Simple syrup"], [3, "dash", "Peychaud's bitters"], [1, "barspoon", "Absinthe"]],
        directions: "Rinse a chilled glass with the absinthe and dump it. Stir the rest with ice and strain into the glass. Express the lemon peel and discard it.",
        description: "New Orleans' drink: rye, Peychaud's and an absinthe rinse, served without ice."
    },
    {
        name: "Americano", style: "Spirit-forward", glass: "Highball", garnish: "Orange slice",
        build: [[1.5, "fl oz", "Campari"], [1.5, "fl oz", "Sweet vermouth"], [3, "fl oz", "Club soda"]],
        directions: "Build Campari and vermouth over ice. Top with soda and stir once.",
        description: "The low-proof ancestor of the Negroni."
    },

    // ===== Sours =====
    {
        name: "Daiquiri", style: "Sour", glass: "Coupe", garnish: "Lime wheel",
        build: [[2, "fl oz", "White rum"], [1, "fl oz", "Lime juice"], [0.75, "fl oz", "Simple syrup"]],
        directions: "Shake hard with ice. Double strain into a chilled coupe.",
        description: "Rum, lime and sugar. The test of a bartender's balance."
    },
    {
        name: "Margarita", style: "Sour", glass: "Rocks", garnish: "Salt rim, lime wheel",
        build: [[2, "fl oz", "Blanco tequila"], [1, "fl oz", "Lime juice"], [1, "fl oz", "Orange liqueur"]],
        directions: "Shake with ice. Strain over fresh ice into a half salt-rimmed rocks glass.",
        description: "Tequila, lime and orange liqueur. Ask salt or no salt."
    },
    {
        name: "Tommy's Margarita", style: "Sour", glass: "Rocks", garnish: "Lime wheel",
        build: [[2, "fl oz", "Blanco tequila"], [1, "fl oz", "Lime juice"], [0.5, "fl oz", "Agave syrup"]],
        directions: "Shake with ice. Strain over fresh ice.",
        description: "Agave syrup in place of orange liqueur, so the tequila leads."
    },
    {
        name: "Whiskey Sour", style: "Sour", glass: "Rocks", garnish: "Angostura dots, cherry",
        build: [[2, "fl oz", "Bourbon"], [0.75, "fl oz", "Lemon juice"], [0.75, "fl oz", "Simple syrup"], [1, "each", "Egg white"]],
        directions: "Dry shake without ice, then shake with ice. Strain over fresh ice. Dot bitters on the foam.",
        description: "Egg white makes it silky. Ask about allergies, or offer it without."
    },
    {
        name: "Gimlet", style: "Sour", glass: "Coupe", garnish: "Lime wheel",
        build: [[2, "fl oz", "London dry gin"], [0.75, "fl oz", "Lime juice"], [0.75, "fl oz", "Simple syrup"]],
        directions: "Shake hard with ice. Double strain into a chilled coupe.",
        description: "A gin Daiquiri, basically. Bright and simple."
    },
    {
        name: "Sidecar", style: "Sour", glass: "Coupe", garnish: "Sugar rim, orange twist",
        build: [[2, "fl oz", "Cognac"], [0.75, "fl oz", "Orange liqueur"], [0.75, "fl oz", "Lemon juice"]],
        directions: "Shake with ice. Strain into a sugar-rimmed coupe.",
        description: "Cognac, orange and lemon. The brandy cousin of the Margarita."
    },
    {
        name: "Cosmopolitan", style: "Sour", glass: "Coupe", garnish: "Orange twist",
        build: [[1.5, "fl oz", "Citrus vodka"], [0.75, "fl oz", "Orange liqueur"], [0.5, "fl oz", "Lime juice"], [1, "fl oz", "Cranberry juice"]],
        directions: "Shake with ice. Double strain into a chilled coupe.",
        description: "Pink, tart and dry when it's made right, not sweet."
    },
    {
        name: "Last Word", style: "Sour", glass: "Coupe", garnish: "None (or a cherry)",
        build: [[0.75, "fl oz", "London dry gin"], [0.75, "fl oz", "Green Chartreuse"], [0.75, "fl oz", "Maraschino liqueur"], [0.75, "fl oz", "Lime juice"]],
        directions: "Shake with ice. Double strain into a chilled coupe.",
        description: "Four equal parts, herbal and tart."
    },
    {
        name: "Aviation", style: "Sour", glass: "Coupe", garnish: "Brandied cherry",
        build: [[2, "fl oz", "London dry gin"], [0.5, "fl oz", "Maraschino liqueur"], [0.25, "fl oz", "Crème de violette"], [0.75, "fl oz", "Lemon juice"]],
        directions: "Shake with ice. Double strain into a chilled coupe.",
        description: "Pale sky-blue from the violet liqueur. Floral and tart."
    },
    {
        name: "Paper Plane", style: "Sour", glass: "Coupe", garnish: "None",
        build: [[0.75, "fl oz", "Bourbon"], [0.75, "fl oz", "Aperol"], [0.75, "fl oz", "Amaro Nonino"], [0.75, "fl oz", "Lemon juice"]],
        directions: "Shake with ice. Double strain into a chilled coupe.",
        description: "A modern classic in four equal parts: bittersweet and easy to love."
    },
    {
        name: "Penicillin", style: "Sour", glass: "Rocks", garnish: "Candied ginger",
        build: [[2, "fl oz", "Blended Scotch"], [0.75, "fl oz", "Lemon juice"], [0.75, "fl oz", "Honey-ginger syrup"], [0.25, "fl oz", "Islay Scotch"]],
        directions: "Shake everything but the Islay with ice. Strain over one large cube. Float the Islay Scotch on top.",
        description: "Honey, ginger and lemon with a smoky float."
    },
    {
        name: "Naked & Famous", style: "Sour", glass: "Coupe", garnish: "None",
        build: [[0.75, "fl oz", "Mezcal"], [0.75, "fl oz", "Yellow Chartreuse"], [0.75, "fl oz", "Aperol"], [0.75, "fl oz", "Lime juice"]],
        directions: "Shake with ice. Double strain into a chilled coupe.",
        description: "Smoky, bittersweet and herbal in four equal parts."
    },

    // ===== Highballs =====
    {
        name: "Gin & Tonic", style: "Highball", glass: "Highball", garnish: "Lime wedge",
        build: [[2, "fl oz", "London dry gin"], [4, "fl oz", "Tonic water"]],
        directions: "Fill the glass with ice. Add gin, top with cold tonic, stir once gently.",
        description: "Cold glass, lots of ice, fresh tonic. That's the whole secret."
    },
    {
        name: "Moscow Mule", style: "Highball", glass: "Copper mug", garnish: "Lime wheel",
        build: [[2, "fl oz", "Vodka"], [0.5, "fl oz", "Lime juice"], [4, "fl oz", "Ginger beer"]],
        directions: "Build over ice. Top with ginger beer and stir once.",
        description: "Vodka, lime and spicy ginger beer in a copper mug."
    },
    {
        name: "Dark 'n Stormy", style: "Highball", glass: "Highball", garnish: "Lime wedge",
        build: [[2, "fl oz", "Dark rum"], [0.5, "fl oz", "Lime juice"], [4, "fl oz", "Ginger beer"]],
        directions: "Build ginger beer and lime over ice. Float the rum on top.",
        description: "Ginger beer with dark rum floated on top."
    },
    {
        name: "Paloma", style: "Highball", glass: "Highball", garnish: "Grapefruit wedge, salt rim",
        build: [[2, "fl oz", "Blanco tequila"], [0.5, "fl oz", "Lime juice"], [4, "fl oz", "Grapefruit soda"]],
        directions: "Build over ice in a salt-rimmed glass. Top with grapefruit soda and stir once.",
        description: "Mexico's favorite tequila highball. Salty, tart and refreshing."
    },
    {
        name: "Mojito", style: "Highball", glass: "Highball", garnish: "Mint sprig",
        build: [[2, "fl oz", "White rum"], [1, "fl oz", "Lime juice"], [0.75, "fl oz", "Simple syrup"], [8, "each", "Mint leaves"], [1, "fl oz", "Club soda"]],
        directions: "Gently press the mint with the syrup. Add rum and lime, fill with crushed ice, top with soda and stir up.",
        description: "Press the mint, don't shred it, or it turns bitter."
    },
    {
        name: "Tom Collins", style: "Highball", glass: "Collins", garnish: "Lemon wheel, cherry",
        build: [[2, "fl oz", "London dry gin"], [1, "fl oz", "Lemon juice"], [0.5, "fl oz", "Simple syrup"], [2, "fl oz", "Club soda"]],
        directions: "Shake gin, lemon and syrup with ice. Strain over fresh ice and top with soda.",
        description: "Sparkling gin lemonade vibes."
    },
    {
        name: "Long Island Iced Tea", style: "Highball", glass: "Collins", garnish: "Lemon wedge",
        build: [
            [0.5, "fl oz", "Vodka"], [0.5, "fl oz", "London dry gin"], [0.5, "fl oz", "White rum"],
            [0.5, "fl oz", "Blanco tequila"], [0.5, "fl oz", "Orange liqueur"], [0.75, "fl oz", "Lemon juice"],
            [0.5, "fl oz", "Simple syrup"], [1, "fl oz", "Cola"]
        ],
        directions: "Shake everything but the cola with ice. Strain over fresh ice and top with a splash of cola.",
        description: "Five spirits, no tea. Costs more than it looks, so price it carefully."
    },
    {
        name: "Bloody Mary", style: "Brunch & after dinner", glass: "Pint", garnish: "Celery stalk, lemon wedge",
        build: [[1.5, "fl oz", "Vodka"], [4, "fl oz", "Tomato juice"], [0.5, "fl oz", "Lemon juice"], [3, "dash", "Worcestershire sauce"], [2, "dash", "Hot sauce"]],
        directions: "Add a pinch of celery salt and black pepper. Roll between two tins with ice (don't shake). Strain over fresh ice.",
        description: "Rolling keeps the tomato from going foamy. Ask how spicy."
    },

    // ===== Tiki =====
    {
        name: "Mai Tai", style: "Tiki", glass: "Rocks", garnish: "Mint sprig, lime shell",
        build: [[2, "fl oz", "Aged rum"], [0.75, "fl oz", "Lime juice"], [0.5, "fl oz", "Orange liqueur"], [0.5, "fl oz", "Orgeat"], [0.25, "fl oz", "Simple syrup"]],
        directions: "Shake with crushed ice. Pour everything into the glass. Garnish with mint and the spent lime shell.",
        description: "Rum, lime and almond. Not the red, juice-heavy version."
    },
    {
        name: "Piña Colada", style: "Tiki", glass: "Hurricane", garnish: "Pineapple wedge, cherry",
        build: [[2, "fl oz", "White rum"], [1.5, "fl oz", "Cream of coconut"], [1.5, "fl oz", "Pineapple juice"], [0.5, "fl oz", "Lime juice"]],
        directions: "Shake hard with ice (or blend with a cup of ice). Pour into the glass.",
        description: "A squeeze of lime keeps it from being too sweet."
    },

    // ===== Sparkling =====
    {
        name: "French 75", style: "Sparkling", glass: "Flute", garnish: "Lemon twist",
        build: [[1, "fl oz", "London dry gin"], [0.5, "fl oz", "Lemon juice"], [0.5, "fl oz", "Simple syrup"], [2, "fl oz", "Sparkling wine"]],
        directions: "Shake gin, lemon and syrup with ice. Strain into a flute and top with sparkling wine.",
        description: "Gin sour topped with bubbles."
    },
    {
        name: "Aperol Spritz", style: "Sparkling", glass: "Wine glass", garnish: "Orange slice",
        build: [[3, "fl oz", "Prosecco"], [2, "fl oz", "Aperol"], [1, "fl oz", "Club soda"]],
        directions: "Build over ice: prosecco first, then Aperol, then soda. Stir once.",
        description: "3-2-1: prosecco, Aperol, soda. Low proof, high volume."
    },

    // ===== Brunch & after dinner =====
    {
        name: "Espresso Martini", style: "Brunch & after dinner", glass: "Coupe", garnish: "3 coffee beans",
        build: [[1.50, "fl oz", "Vodka"], [0.75, "fl oz", "Coffee liqueur"], [1, "fl oz", "Espresso"], [0.25, "fl oz", "Simple syrup"]],
        directions: "Shake very hard with ice for a thick foam. Double strain into a chilled coupe.",
        description: "Fresh espresso and a hard shake make the foam."
    },
    {
        name: "Irish Coffee", style: "Brunch & after dinner", glass: "Irish coffee mug", garnish: "Lightly whipped cream",
        build: [[1.5, "fl oz", "Irish whiskey"], [4, "fl oz", "Hot coffee"], [0.5, "fl oz", "Demerara syrup"], [1, "fl oz", "Heavy cream"]],
        directions: "Warm the mug. Add whiskey, syrup and coffee. Float the half-whipped cream over the back of a spoon. Don't stir.",
        description: "Drink the hot coffee through the cold cream."
    },
    {
        name: "Mint Julep", style: "Spirit-forward", glass: "Julep cup", garnish: "Big mint bouquet",
        build: [[2.5, "fl oz", "Bourbon"], [0.5, "fl oz", "Simple syrup"], [8, "each", "Mint leaves"]],
        directions: "Gently press the mint with the syrup. Add bourbon, pack with crushed ice, stir until frosty, crown with more ice and mint.",
        description: "Lots of crushed ice and a big mint bouquet you smell as you sip."
    }
];

export const CLASSIC_STYLES: ClassicStyle[] = ["Spirit-forward", "Sour", "Highball", "Tiki", "Sparkling", "Brunch & after dinner"];

// Is there already a recipe with this classic's name?
export function hasRecipeNamed(name: string): boolean {
    const lower = name.toLowerCase();
    return db.recipes.some((r) => r.name.toLowerCase() === lower);
}

// Copy a classic into the bar's recipes and return the new recipe's id
//     IF a recipe with that name exists, call the copy "<name> (classic)"
//     FOR each ingredient: reuse the bar's ingredient with that name, or make it
export function addClassic(classic: Classic): string {
    const recipe: Recipe = {
        id: makeId(),
        name: hasRecipeNamed(classic.name) ? classic.name + " (classic)" : classic.name,
        type: "Cocktail",
        yieldAmount: 1,
        yieldUnit: "serving",
        menuPrice: null,
        producesIngredientId: null,
        laborWage: null,
        laborMinutes: null,
        glass: classic.glass,
        garnish: classic.garnish,
        description: classic.description,
        directions: classic.directions
    };
    db.recipes.push(recipe);
    for (const [amount, unit, name] of classic.build) {
        db.recipeLines.push({
            id: makeId(), recipeId: recipe.id, ingredientId: getOrCreateIngredient(name).id, subRecipeId: null,
            choicePurchaseUnitId: null, choiceRecipeId: null, amount, unit
        });
    }
    commit();
    return recipe.id;
}

// ===== storage.js =====
// Owns the data. Every other file reads and changes `db` from here.
//
// The data is stored as separate "tables" that match the ERD.
// Tables point at each other by ID, like foreign keys in a database.
//
// db = {
//     distributors: [{ id, companyName, companyPhone, street, city,
//                      state, zip, repName, repPhone }],
//     items:        [{ id, distributorId, name, category,
//                      packCount, packSize, sizeUnit, yieldPercent }],
//     priceEntries: [{ itemId, date, amount }],      key = itemId + date
//     recipes:      [{ id, name, type, yieldAmount, yieldUnit, menuPrice }],
//     recipeLines:  [{ id, recipeId, itemId, subRecipeId, amount, unit }]
//                   each line uses an item OR a sub-recipe, never both
// }

const STORAGE_KEY = "barTool.data";

function emptyData() {
    return {
        distributors: [],
        items: [],
        priceEntries: [],
        recipes: [],
        recipeLines: []
    };
}

// localStorage only holds text, so the db is saved as JSON text
export function loadData() {
    const data = emptyData();
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === null) {
            return data; // first time opening the app
        }
        const parsed = JSON.parse(saved);

        // Copy each saved table. Tables added in later versions start empty.
        for (const table of Object.keys(data)) {
            if (Array.isArray(parsed[table])) {
                data[table] = parsed[table];
            }
        }
    } catch (error) {
        console.log("Could not load saved data:", error);
    }
    return data;
}

export const db = loadData();

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (error) {
        console.log("Could not save data:", error);
    }
}


// ----- Change notifications -----
// After any file changes the data, it calls commit(). That saves the
// data and tells every listener (main.js's renderAll) to redraw.
// This way items.js doesn't need to know how recipes are drawn.

const listeners = [];

export function onChange(listener) {
    listeners.push(listener);
}

export function commit() {
    saveData();
    for (const listener of listeners) {
        listener();
    }
}

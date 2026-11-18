// ===== storage.js =====
// Holds all the app's data and saves it in the browser.
//
// Data is split into tables that match the ERD:
//     distributors   { id, bizName, bizPhone, street, city, state, zip, repName, repPhone }
//     items          { id, distributorId, name, category, packCount, packSize, sizeUnit, yieldPercent }
//     priceEntries   { itemId, date, amount }        one per item per day
//     recipes        { id, name, type, yieldAmount, yieldUnit, menuPrice }
//     recipeLines    { id, recipeId, itemId, subRecipeId, amount, unit }   item OR sub-recipe

// Name the data is saved under (bump the version if the data's shape changes)
const STORAGE_KEY = "barTool.data.v3";

// Make a fresh set of empty tables
function emptyData() {
    return {
        distributors: [],
        items: [],
        priceEntries: [],
        recipes: [],
        recipeLines: []
    };
}

// Load saved data from the browser
//     IF nothing saved, return empty tables
//     ELSE turn the saved text back into tables
export function loadData() {
    const data = emptyData();
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === null) {
            return data;
        }
        const parsed = JSON.parse(saved);   // text -> objects

        // Copy each saved table (any table missing from an old save stays empty)
        for (const table of Object.keys(data)) {
            if (Array.isArray(parsed[table])) {
                data[table] = parsed[table];
            }
        }
    } catch (error) {
        // If the saved data is broken, start empty instead of crashing
        console.log("Could not load saved data:", error);
    }
    return data;
}

// The one shared copy of all data. Every file imports this.
export const db = loadData();

// Save all data to the browser as text
function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));   // objects -> text
    } catch (error) {
        console.log("Could not save data:", error);
    }
}


// ===== Change notifications =====
// Any file that changes data calls commit()
// commit() saves, then runs every function registered with onChange()
// (main.js registers renderAll, so every save redraws every screen)

const listeners = [];

// Remember a function to run after every save
export function onChange(listener) {
    listeners.push(listener);
}

// Save, then run every remembered function
export function commit() {
    saveData();
    for (const listener of listeners) {
        listener();
    }
}
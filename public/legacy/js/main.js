// ===== main.js =====
// Starts the app. index.html loads this file first.
//
// SET UP the tabs and every screen
// WHEN data changes, redraw every screen
// DRAW every screen once now

// Borrow functions from the other files
import { onChange } from "./storage.js";
import { initVendors, renderVendors } from "./vendors.js";
import { initIngredients, renderIngredients } from "./ingredients.js";
import { initProducts, renderProducts } from "./products.js";
import { initRecipes, renderRecipes } from "./recipes.js";


// Redraw every screen (screens depend on each other, so redraw them all)
function renderAll() {
    renderVendors();
    renderIngredients();
    renderProducts();
    renderRecipes();
}


// ===== Tabs =====

// Show the screen with this id, hide the rest
function showView(viewId) {
    for (const view of document.querySelectorAll(".view")) {
        view.hidden = view.id !== viewId;   // hide it if it's not the one we want
    }
    // Highlight the matching tab (its data-view attribute names its screen)
    for (const tab of document.querySelectorAll(".tab")) {
        tab.classList.toggle("active", tab.dataset.view === viewId);
    }
}

// When a tab is clicked, show its screen
function initTabs() {
    for (const tab of document.querySelectorAll(".tab")) {
        tab.addEventListener("click", function () {
            showView(tab.dataset.view);
        });
    }
}


// ===== Start up (runs as soon as the file loads) =====

initTabs();
initVendors();
initIngredients();
initProducts();
initRecipes();

// After every save, run renderAll (no parentheses = hand it over, don't run it yet)
onChange(renderAll);

// Draw everything now (parentheses = run it)
renderAll();
// ===== main.js =====
// The starting point. Sets up each screen, the tabs, and redrawing.

import { onChange } from "./storage.js";
import { initDistributors, renderDistributors } from "./distributors.js";
import { initItems, renderItems } from "./items.js";
import { initRecipes, renderRecipes } from "./recipes.js";

// Redraw every screen from the data. Runs after every commit().
function renderAll() {
    renderDistributors();
    renderItems();
    renderRecipes();
}


// ----- Tabs -----

function showView(viewId) {
    for (const view of document.querySelectorAll(".view")) {
        view.hidden = view.id !== viewId;
    }
    for (const tab of document.querySelectorAll(".tab")) {
        tab.classList.toggle("active", tab.dataset.view === viewId);
    }
}

function initTabs() {
    for (const tab of document.querySelectorAll(".tab")) {
        tab.addEventListener("click", function () {
            showView(tab.dataset.view);
        });
    }
}


// ----- Start up -----

initTabs();
initDistributors();
initItems();
initRecipes();
onChange(renderAll);
renderAll();

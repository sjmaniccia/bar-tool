// ===== main.tsx =====
// Starts the app: sets up the pages (routes) and draws the app into <div id="root">.
//
// Each page has its own address after the #, so Back, bookmarks and refresh all work:
//     #/                 Dashboard
//     #/recipes          Recipe list
//     #/recipes/<id>     One recipe
// The # keeps everything on one real page, which GitHub Pages needs.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import RecipesList from "./pages/RecipesList";
import RecipeDetail from "./pages/RecipeDetail";
import ClassicScreen from "./pages/ClassicScreen";
import NotFound from "./pages/NotFound";
// Fonts are bundled with the app (no outside requests): Playfair Display for headings, DM Sans for text
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./styles.css";
import { applySavedTheme } from "./theme";

// Show a saved light/dark choice before the first draw (no flash)
applySavedTheme();

const router = createHashRouter([
    {
        path: "/",
        element: <Layout />,                 // sidebar + header around every page
        children: [
            { index: true, element: <Dashboard /> },
            { path: "recipes", element: <RecipesList /> },
            { path: "recipes/:recipeId", element: <RecipeDetail /> },   // :recipeId is filled from the address
            // Not rebuilt yet: these open the classic screens, which share the same data
            { path: "products", element: <ClassicScreen name="Products" /> },
            { path: "ingredients", element: <ClassicScreen name="Ingredients" /> },
            { path: "vendors", element: <ClassicScreen name="Vendors" /> },
            { path: "*", element: <NotFound /> }
        ]
    }
]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
);

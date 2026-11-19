// ===== main.tsx =====
// Starts the app: sets up the pages (routes) and draws the app into <div id="root">.
//
// Each page has its own address after the #, so Back, bookmarks and refresh all work:
//     #/                 Dashboard
//     #/recipes          Recipe list
//     #/recipes/<id>     One recipe
//     ...and the same pattern for products, ingredients, vendors, counts, orders, invoices, menus
// The # keeps everything on one real page, which GitHub Pages needs.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import RecipesList from "./pages/RecipesList";
import RecipeDetail from "./pages/RecipeDetail";
import ProductsList from "./pages/ProductsList";
import ProductDetail from "./pages/ProductDetail";
import IngredientsList from "./pages/IngredientsList";
import IngredientDetail from "./pages/IngredientDetail";
import VendorsList from "./pages/VendorsList";
import VendorDetail from "./pages/VendorDetail";
import CountsList from "./pages/CountsList";
import CountDetail from "./pages/CountDetail";
import OrdersList from "./pages/OrdersList";
import OrderDetail from "./pages/OrderDetail";
import InvoicesList from "./pages/InvoicesList";
import InvoiceDetail from "./pages/InvoiceDetail";
import MenusList from "./pages/MenusList";
import MenuDetail from "./pages/MenuDetail";
import SpecBook from "./pages/SpecBook";
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
            { path: "products", element: <ProductsList /> },
            { path: "products/:productId", element: <ProductDetail /> },
            { path: "ingredients", element: <IngredientsList /> },
            { path: "ingredients/:ingredientId", element: <IngredientDetail /> },
            { path: "vendors", element: <VendorsList /> },
            { path: "vendors/:vendorId", element: <VendorDetail /> },
            { path: "counts", element: <CountsList /> },
            { path: "counts/:countId", element: <CountDetail /> },
            { path: "orders", element: <OrdersList /> },
            { path: "orders/:orderId", element: <OrderDetail /> },
            { path: "invoices", element: <InvoicesList /> },
            { path: "invoices/:invoiceId", element: <InvoiceDetail /> },
            { path: "menus", element: <MenusList /> },
            { path: "menus/:menuId", element: <MenuDetail /> },
            { path: "menus/:menuId/specs", element: <SpecBook /> },
            { path: "*", element: <NotFound /> }
        ]
    }
]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
);

// ===== main.tsx =====
// Starts the app: sets up the pages (routes) and draws the app into <div id="root">.
//
// Each page has its own address after the #, so Back, bookmarks and refresh all work:
//     #/                 Dashboard
//     #/recipes          Recipe list
//     #/recipes/<id>     One recipe
//     ...and the same pattern for products, ingredients, vendors, counts, orders, invoices, menus, sales
//     #/reports          Variance report (what was sold vs what was used)
//     #/waste            Waste log
//     #/data             Backup, exports, products import
//     #/training         Flashcards and quizzes from your recipes
//     #/classics         Classic cocktail library
//     #/specs            Spec books for every menu
//     #/team             Team members, roles and invites (signed in)
// The # keeps everything on one real page, which GitHub Pages needs.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, createHashRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import Gate from "./components/Gate";
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
import ScanInvoice from "./pages/ScanInvoice";
import InvoicesList from "./pages/InvoicesList";
import InvoiceDetail from "./pages/InvoiceDetail";
import MenusList from "./pages/MenusList";
import MenuDetail from "./pages/MenuDetail";
import SpecBook from "./pages/SpecBook";
import SalesList from "./pages/SalesList";
import SalesDetail from "./pages/SalesDetail";
import VarianceReport from "./pages/VarianceReport";
import WasteLog from "./pages/WasteLog";
import DataPage from "./pages/DataPage";
import Training from "./pages/Training";
import Classics from "./pages/Classics";
import SpecBooks from "./pages/SpecBooks";
import Team from "./pages/Team";
import { startSession } from "./cloud/session";
import NotFound from "./pages/NotFound";
// The font is bundled with the app (no outside requests): DM Sans for everything
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./styles.css";
import { applySavedTheme } from "./theme";

// Show a saved light/dark choice before the first draw (no flash)
applySavedTheme();

// Check who's signed in (does nothing if no Supabase project is set up)
startSession();

// Register the service worker so the app opens offline and can be installed
//     Only in the built app: during `npm run dev` it would cache files you're still editing
if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch((error) => console.log("Offline mode unavailable:", error));
    });
}

const router = createHashRouter([
    {
        path: "/",
        element: <Gate />,                   // sign-in screens, or the sidebar + header around every page
        children: [
            { index: true, element: <Navigate to="/recipes" replace /> },   // recipes are the home page
            { path: "dashboard", element: <Dashboard /> },
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
            { path: "invoices/scan", element: <ScanInvoice /> },
            { path: "invoices/:invoiceId", element: <InvoiceDetail /> },
            { path: "menus", element: <MenusList /> },
            { path: "menus/:menuId", element: <MenuDetail /> },
            { path: "menus/:menuId/specs", element: <SpecBook /> },
            { path: "sales", element: <SalesList /> },
            { path: "sales/:importId", element: <SalesDetail /> },
            { path: "reports", element: <VarianceReport /> },
            { path: "waste", element: <WasteLog /> },
            { path: "data", element: <DataPage /> },
            { path: "training", element: <Training /> },
            { path: "classics", element: <Classics /> },
            { path: "specs", element: <SpecBooks /> },
            { path: "team", element: <Team /> },
            { path: "*", element: <NotFound /> }
        ]
    }
]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
);

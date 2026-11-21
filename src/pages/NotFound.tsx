// ===== NotFound.tsx =====
// Shown for any address that doesn't match a page.

import { Link } from "react-router";

export default function NotFound() {
    return (
        <div className="page">
            <h1>Page not found</h1>
            <p><Link to="/recipes">Back to your recipes</Link></p>
        </div>
    );
}

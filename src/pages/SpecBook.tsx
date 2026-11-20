// ===== SpecBook.tsx =====
// A printable spec book for one menu: every recipe with its build, glass,
// garnish and method, the way staff learn them. No costs on it, so it can
// go behind the bar. Each recipe starts on its own half page when printed.

import { Link, useParams } from "react-router";
import { useDb } from "../data/storage";
import { menuRows } from "../data/menus";
import { linesFor } from "../data/costing";
import { findById, formatFraction } from "../data/utils";
import { useSession } from "../cloud/session";
import { canEdit } from "../cloud/access";

export default function SpecBook() {
    const db = useDb();
    const { menuId } = useParams();
    const menu = findById(db.menus, menuId ?? null);
    const session = useSession();
    // Staff come here from Spec books; managers from the menu
    const back = canEdit(session.bar?.role ?? null) && menu ? { to: "/menus/" + menu.id, label: menu.name } : { to: "/specs", label: "Spec books" };

    if (menu === null) {
        return (
            <div className="page">
                <h1>Menu not found</h1>
                <Link to="/menus">← Menus</Link>
            </div>
        );
    }

    const rows = menuRows(menu.id);

    return (
        <div className="page spec-book">
            <Link to={back.to} className="back no-print">← {back.label}</Link>
            <div className="page-header">
                <div>
                    <h1>{menu.name}</h1>
                    <p className="muted">Spec book · {rows.length} {rows.length === 1 ? "recipe" : "recipes"}</p>
                </div>
                <button className="no-print" onClick={() => window.print()}>Print</button>
            </div>

            {rows.map(({ recipe }) => (
                <article key={recipe.id} className="card spec">
                    <h2>{recipe.name}</h2>
                    <div className="spec-meta">
                        {recipe.glass && <span><span className="field-label">Glass</span> {recipe.glass}</span>}
                        {recipe.garnish && <span><span className="field-label">Garnish</span> {recipe.garnish}</span>}
                    </div>
                    <ul className="spec-build">
                        {linesFor(recipe.id).map((line) => {
                            const name = line.ingredientId !== null
                                ? findById(db.ingredients, line.ingredientId)?.name
                                : findById(db.recipes, line.subRecipeId)?.name;
                            return (
                                <li key={line.id}>
                                    <span className="spec-amount">{formatFraction(line.amount)} {line.unit}</span>
                                    <span>{name ?? "?"}</span>
                                </li>
                            );
                        })}
                    </ul>
                    {recipe.directions && <p className="directions">{recipe.directions}</p>}
                    {recipe.description && <p className="muted">{recipe.description}</p>}
                </article>
            ))}
        </div>
    );
}

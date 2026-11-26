// ===== RecipeTitle.tsx =====
// A recipe's name as the page title, edited right there: tap it, type, press Enter
// (or tap away) to save. Read-only for a recipe you can't change.
//     a long name wraps onto more lines (a text box that grows), it never gets cut off
//     an empty name puts the old one back
//     a brand-new recipe ("New recipe") starts with the name selected, ready to type over

import { useEffect, useRef, useState } from "react";
import { updateRecipe } from "../../data/actions";
import type { Recipe } from "../../data/types";

export default function RecipeTitle({ recipe, readOnly = false }: { recipe: Recipe; readOnly?: boolean }) {
    const [text, setText] = useState(recipe.name);
    const box = useRef<HTMLTextAreaElement>(null);
    const fresh = recipe.name === "New recipe";

    // WHEN the name changes elsewhere, show it
    useEffect(() => setText(recipe.name), [recipe.name]);

    // Grow to fit every line of the name, again whenever its width changes
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const fit = () => {
            el.style.height = "auto";
            el.style.height = el.scrollHeight + "px";
        };
        fit();
        const watch = new ResizeObserver(fit);
        watch.observe(el);
        void document.fonts?.ready.then(fit);
        return () => watch.disconnect();
    }, [text]);

    // A new recipe: ready to type its name
    useEffect(() => {
        if (fresh && box.current) {
            box.current.focus();
            box.current.select();
        }
    }, [fresh]);

    if (readOnly) return <h1>{recipe.name}</h1>;

    function save() {
        const name = text.replace(/\s+/g, " ").trim();
        if (name === "") return setText(recipe.name);
        if (name !== recipe.name) updateRecipe(recipe.id, { name });
    }

    return (
        <h1 className="title-edit">
            <textarea ref={box} rows={1} className="title-input" aria-label="Recipe name" value={text}
                onChange={(e) => setText(e.target.value.replace(/\n/g, ""))}
                onBlur={save}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
        </h1>
    );
}

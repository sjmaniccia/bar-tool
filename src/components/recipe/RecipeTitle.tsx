// ===== RecipeTitle.tsx =====
// A recipe's name as the page title, edited right there (EditableTitle.tsx).
// A brand-new recipe ("New recipe") starts with the name selected, ready to type over.

import EditableTitle from "../EditableTitle";
import { updateRecipe } from "../../data/actions";
import type { Recipe } from "../../data/types";

export default function RecipeTitle({ recipe, readOnly = false }: { recipe: Recipe; readOnly?: boolean }) {
    return <EditableTitle value={recipe.name} readOnly={readOnly} fresh={recipe.name === "New recipe"} label="Recipe name"
        onSave={(name) => updateRecipe(recipe.id, { name })} />;
}

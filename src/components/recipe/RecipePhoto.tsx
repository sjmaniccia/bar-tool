// ===== RecipePhoto.tsx =====
// The recipe's picture at the top of its page, with Add / Change / Remove.
// Pictures from scanned recipe pages show up here on their own; this is for adding
// or replacing one by hand (take a photo of the finished drink or dish, or choose one).
// readOnly: just the picture (someone else's recipe in a Just recipes place).
// A copy ("Make my version", Duplicate) shares its picture, so a picture is only
// deleted from storage once no other recipe uses it.

import { useState } from "react";
import { useSession } from "../../cloud/session";
import { removePhoto, savePhoto, shrinkForRecipe } from "../../cloud/photos";
import { updateRecipe } from "../../data/actions";
import { toast } from "../../feedback";
import type { Recipe } from "../../data/types";
import { db } from "../../data/storage";

// Delete the stored picture unless another recipe still shows it
function dropIfUnused(url: string, recipeId: string) {
    if (url && !db.recipes.some((r) => r.id !== recipeId && r.photo === url)) void removePhoto(url);
}

export default function RecipePhoto({ recipe, readOnly = false }: { recipe: Recipe; readOnly?: boolean }) {
    const session = useSession();
    const [busy, setBusy] = useState(false);
    const placeId = session.mode === "ready" ? session.bar?.id ?? null : null;

    async function choose(file: File | undefined) {
        if (!file) return;
        if (!file.type.startsWith("image/")) return toast("That isn't a picture", { tone: "warn" });
        setBusy(true);
        try {
            const kept = await savePhoto(placeId, await shrinkForRecipe(file));
            if ("error" in kept) {
                toast("Couldn't keep the picture", { sub: kept.error, tone: "warn" });
            } else {
                const old = recipe.photo;
                updateRecipe(recipe.id, { photo: kept.url });
                dropIfUnused(old, recipe.id);
                toast("Picture added", { sound: "tick" });
            }
        } catch {
            toast("Couldn't read that picture", { tone: "warn" });
        }
        setBusy(false);
    }

    function remove() {
        if (!confirm("Remove this picture?")) return;
        const old = recipe.photo;
        updateRecipe(recipe.id, { photo: "" });
        dropIfUnused(old, recipe.id);
    }

    const CAMERA = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle></svg>;
    const TRASH = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3"></path></svg>;

    if (readOnly) {
        return recipe.photo ? <div className="recipe-photo"><img src={recipe.photo} alt={"Picture of " + recipe.name} /></div> : null;
    }
    if (!recipe.photo) {
        return (
            // The whole box is the button: just a camera
            <label className={"recipe-photo empty no-print" + (busy ? " busy" : "")} aria-label="Add a picture" title="Add a picture">
                <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
                {busy ? <span className="small">Saving…</span>
                    : <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle></svg>}
            </label>
        );
    }
    return (
        <div className="recipe-photo">
            <img src={recipe.photo} alt={"Picture of " + recipe.name} />
            {/* Two small round buttons on the picture's corner: a new picture, or none */}
            <div className="recipe-photo-actions no-print">
                <label className={"photo-icon" + (busy ? " busy" : "")} aria-label="Change the picture" title="Change the picture">
                    <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
                    {busy ? "…" : CAMERA}
                </label>
                <button className="photo-icon" aria-label="Remove the picture" title="Remove the picture" onClick={remove}>{TRASH}</button>
            </div>
        </div>
    );
}

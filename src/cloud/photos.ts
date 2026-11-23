// ===== photos.ts =====
// Recipe pictures: cut one out of a scanned page, or take one, and keep it.
//
//     cropPhoto(file, box)   the part of a photo inside a box (from the scanner), as a JPEG
//     shrinkForRecipe(file)  a whole photo, made small enough to keep
//     savePhoto(...)         signed in: upload to Supabase Storage (recipe-photos.sql) -> its web address
//                            the demo (no account): a small picture kept inside the recipe itself
//     removePhoto(url)       deletes an uploaded picture (best effort)

import { supabase } from "./client";
import type { PhotoBox } from "../../supabase/functions/_shared/recipe-scan";

const KEEP_SIDE = 1000;      // big enough for a phone screen, small enough to load fast
const DEMO_SIDE = 420;       // kept in this browser's storage, so smaller

// Draw part of an image onto a canvas, at most maxSide on its long side -> a JPEG blob
async function draw(file: Blob, box: PhotoBox | null, maxSide: number): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const sx = box ? box.x * bitmap.width : 0;
    const sy = box ? box.y * bitmap.height : 0;
    const sw = box ? box.w * bitmap.width : bitmap.width;
    const sh = box ? box.h * bitmap.height : bitmap.height;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the picture"))), "image/jpeg", 0.84));
}

export function cropPhoto(file: Blob, box: PhotoBox): Promise<Blob> {
    return draw(file, box, KEEP_SIDE);
}

export function shrinkForRecipe(file: Blob): Promise<Blob> {
    return draw(file, null, KEEP_SIDE);
}

function asDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

// Keep a picture -> its address to put on the recipe, or an error message
//     placeId null = the demo: a small copy stored in the recipe itself
export async function savePhoto(placeId: string | null, picture: Blob): Promise<{ url: string } | { error: string }> {
    if (placeId === null || !supabase) {
        try {
            return { url: await asDataUrl(await draw(picture, null, DEMO_SIDE)) };
        } catch (e) {
            return { error: e instanceof Error ? e.message : "Couldn't keep the picture" };
        }
    }
    const path = placeId + "/" + crypto.randomUUID() + ".jpg";
    const { error } = await supabase.storage.from("recipe-photos").upload(path, picture, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) {
        if (/bucket not found/i.test(error.message)) return { error: "Recipe photos aren't set up yet: run supabase/recipe-photos.sql." };
        return { error: error.message };
    }
    return { url: supabase.storage.from("recipe-photos").getPublicUrl(path).data.publicUrl };
}

export async function removePhoto(url: string) {
    if (!supabase || !url.includes("/recipe-photos/")) return;
    const path = url.split("/recipe-photos/")[1];
    if (path) await supabase.storage.from("recipe-photos").remove([path]);
}

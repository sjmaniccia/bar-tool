// ===== training.ts =====
// Turns the bar's own recipes and tasting notes into flashcards and quizzes,
// so new staff learn the house specs (not someone else's).
//
//     CARDS     one per recipe: front = name, back = build, glass, garnish, method
//     QUIZ      multiple choice, built from the same cards:
//                   "Which drink is this?"           (shown the build)
//                   "How much X goes in a Y?"        (pick the amount)
//                   "What glass is a Y served in?"
//                   "Which product is this?"         (shown its tasting notes)

import { db } from "./storage";
import { linesFor } from "./costing";
import { itemsOf } from "./menus";
import { findById, formatFraction } from "./utils";

export interface SpecLine {
    amount: string;     // "1 ½ fl oz"
    name: string;       // "White rum"
}

export interface Card {
    id: string;
    name: string;
    glass: string;
    garnish: string;
    directions: string;
    description: string;
    lines: SpecLine[];
    raw: { amount: number; unit: string; name: string }[];   // for the amount questions
}

// Which recipes to study: one menu's, or every cocktail (preps and dishes left out)
export function cardsFor(menuId: string | null): Card[] {
    const recipes = menuId === null
        ? db.recipes.filter((r) => r.type === "Cocktail").sort((a, b) => a.name.localeCompare(b.name))
        : itemsOf(menuId).map((item) => findById(db.recipes, item.recipeId)).filter((r) => r !== null);
    return recipes.map((recipe) => {
        const raw = linesFor(recipe.id).map((line) => ({
            amount: line.amount,
            unit: line.unit,
            name: (line.ingredientId !== null
                ? findById(db.ingredients, line.ingredientId)?.name
                : findById(db.recipes, line.subRecipeId)?.name) ?? "?"
        }));
        return {
            id: recipe.id,
            name: recipe.name,
            glass: recipe.glass,
            garnish: recipe.garnish,
            directions: recipe.directions,
            description: recipe.description,
            lines: raw.map((l) => ({ amount: formatFraction(l.amount) + " " + l.unit, name: l.name })),
            raw
        };
    });
}

// Products that have tasting notes, for the "which product is this?" questions
export function notedProducts() {
    return db.products.filter((p) => p.notes.trim() !== "");
}


// ===== Quiz =====

export interface Question {
    prompt: string;
    detail: string[];      // extra lines under the prompt (the build, or the notes)
    choices: string[];
    answer: number;        // index into choices
    cardId: string | null; // to show the full card after answering
}

// Shuffle a copy (Fisher-Yates). `random` can be swapped in tests.
export function shuffle<T>(items: T[], random = Math.random): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// The right answer plus up to 3 different wrong ones, shuffled
function choicesWith(right: string, pool: string[], random: () => number): { choices: string[]; answer: number } {
    const wrong = shuffle([...new Set(pool.filter((p) => p !== right))], random).slice(0, 3);
    const choices = shuffle([right, ...wrong], random);
    return { choices, answer: choices.indexOf(right) };
}

// Wrong amounts that look believable: nearby pour sizes in the same unit
const POUR_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

function amountChoices(amount: number, unit: string): string[] {
    const near = POUR_STEPS.filter((s) => s !== amount).sort((a, b) => Math.abs(a - amount) - Math.abs(b - amount)).slice(0, 4);
    return near.map((s) => formatFraction(s) + " " + unit);
}

// Build a quiz
//     FOR each card: a "which drink" question (IF there are 2+ drinks), an amount question,
//         and a glass question (IF it has a glass and others differ)
//     FOR each product with notes: a "which product" question (IF there are 2+)
//     Shuffle and keep up to `limit`
export function buildQuiz(cards: Card[], withProducts: boolean, limit = 10, random = Math.random): Question[] {
    const questions: Question[] = [];
    const names = cards.map((c) => c.name);
    // The bar's own glasses plus common ones, so there are always enough wrong answers
    const glasses = [...cards.map((c) => c.glass).filter((g) => g !== ""), "Coupe", "Rocks", "Highball", "Collins", "Nick & Nora", "Flute"];

    for (const card of cards) {
        if (card.lines.length === 0) continue;
        if (names.length >= 2) {
            const { choices, answer } = choicesWith(card.name, names, random);
            questions.push({
                prompt: "Which drink is this?",
                detail: card.lines.map((l) => l.amount + " " + l.name),
                choices, answer, cardId: card.id
            });
        }
        // Amounts only make sense for measured pours (not "8 each mint")
        const measured = card.raw.filter((l) => l.unit === "fl oz");
        if (measured.length > 0) {
            const line = measured[Math.floor(random() * measured.length)];
            const right = formatFraction(line.amount) + " " + line.unit;
            const { choices, answer } = choicesWith(right, amountChoices(line.amount, line.unit), random);
            questions.push({
                prompt: "How much " + line.name + " goes in a " + card.name + "?",
                detail: [], choices, answer, cardId: card.id
            });
        }
        if (card.glass !== "") {
            const { choices, answer } = choicesWith(card.glass, glasses, random);
            questions.push({ prompt: "What glass is a " + card.name + " served in?", detail: [], choices, answer, cardId: card.id });
        }
    }

    if (withProducts) {
        const products = notedProducts();
        if (products.length >= 2) {
            for (const product of products) {
                const { choices, answer } = choicesWith(product.name, products.map((p) => p.name), random);
                questions.push({ prompt: "Which product is this?", detail: [product.notes], choices, answer, cardId: null });
            }
        }
    }

    return shuffle(questions, random).slice(0, limit);
}

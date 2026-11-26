// ===== Home.tsx =====
// The first screen. It grows with the place:
//
//     NOT SET UP   one next step at a time (data/setup.ts), each saying what you get before
//                  asking for the work, with a "Later" so nobody gets stuck:
//                      1 get your recipes in      2 get your team on them
//                      3 what each recipe costs   4 which recipes make money   5 count once
//     SET UP       "Today": what needs you (invoices to approve, a count to finish,
//                  recipes over their cost target), or "All caught up"
//     ALWAYS       your recipes, with their cost % (or a dashed "$ ?" until there are prices)
//
// When a step gets done, the next time Home opens it celebrates (a chime and a pop-up).
//
// A "Just recipes" place (data/place.ts) gets a simpler Home:
//     no recipes yet   "Let's get your family's recipes in": scan or type one
//     after that       share them with family (the owner, until someone joins), then the recipes
//     no steps, costs or "Today"

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useDb } from "../data/storage";
import { useSession } from "../cloud/session";
import { cloudEnabled } from "../cloud/client";
import { listMembers } from "../cloud/team";
import { createRecipe } from "../data/actions";
import { summarize } from "../data/costing";
import { recipesOverTarget } from "../data/alerts";
import { invoiceTotal } from "../data/purchasing";
import { formatMoney, formatPercent } from "../data/utils";
import {
    bringBack, lastDoneCount, nextStep, putOff, saveDoneCount, setupSteps, useSetupPrefs,
    type StepId
} from "../data/setup";
import { celebrate, toast } from "../feedback";
import InviteCard from "../components/InviteCard";
import type { Database, Recipe } from "../data/types";
import { useRecipesOnly } from "../data/place";

const STEP_NAMES: Record<StepId, string> = {
    recipes: "Recipes in",
    team: "Team on the recipes",
    costs: "Costs on your recipes",
    sales: "Sales coming in",
    count: "First count done"
};

const LATER_NAMES: Record<StepId, string> = {
    recipes: "Add recipes",
    team: "Invite your team",
    costs: "Find out what recipes cost",
    sales: "Connect your register",
    count: "Count once"
};

export default function Home() {
    return useRecipesOnly() ? <FamilyHome /> : <BusinessHome />;
}

// ===== Just recipes =====

function FamilyHome() {
    const db = useDb();
    const session = useSession();
    const navigate = useNavigate();
    const placeId = session.bar?.id ?? "local";
    const prefs = useSetupPrefs(placeId);
    const isOwner = session.mode === "ready" && session.bar?.role === "owner";
    const newRecipe = () => navigate("/recipes/" + createRecipe("New recipe") + "?edit=1");

    // Is anyone else in yet? (only the owner is asked to invite)
    const [alone, setAlone] = useState(false);
    useEffect(() => {
        if (!isOwner || !session.bar) return;
        let current = true;
        listMembers(session.bar.id).then((m) => { if (current) setAlone(m.length <= 1); }).catch(() => undefined);
        return () => { current = false; };
    }, [isOwner, session.bar]);

    if (db.recipes.length === 0) {
        return (
            <div className="page home">
                <RecipesStep onNew={newRecipe} big family />
            </div>
        );
    }
    const askToShare = alone && !prefs.later.includes("team");
    return (
        <div className="page home">
            <div className="home-head">
                <div>
                    <div className="muted small">{session.bar?.name ?? "Your recipes"}</div>
                    <h1>Your recipes</h1>
                </div>
                <div className="button-row">
                    {cloudEnabled && <Link className="button secondary" to="/recipes/scan">Scan more</Link>}
                    <button className="secondary" onClick={newRecipe}>Type one in</button>
                </div>
            </div>
            {askToShare && (
                <section className="card step-card">
                    <h2 className="step-title">Share them with family</h2>
                    <p className="step-body">Everyone you invite can cook from them on their phone, and add their own.</p>
                    <InviteCard compact />
                    <button className="link-button step-later" onClick={() => putOff(placeId, "team")}>Not now</button>
                </section>
            )}
            <RecipeStrip db={db} noCosts all />
        </div>
    );
}

// ===== Bars, restaurants, breweries =====

function BusinessHome() {
    const db = useDb();
    const session = useSession();
    const navigate = useNavigate();
    const placeId = session.bar?.id ?? "local";
    const prefs = useSetupPrefs(placeId);

    // How many people are on the team (accounts only); undefined while loading
    const [teamSize, setTeamSize] = useState<number | null | undefined>(session.mode === "ready" ? undefined : null);
    useEffect(() => {
        if (session.mode !== "ready" || !session.bar) {
            setTeamSize(null);
            return;
        }
        let current = true;
        listMembers(session.bar.id).then((m) => { if (current) setTeamSize(m.length); }).catch(() => { if (current) setTeamSize(1); });
        return () => { current = false; };
    }, [session.mode, session.bar]);

    const steps = setupSteps(db, teamSize === undefined ? null : teamSize);
    const doneCount = steps.filter((s) => s.done).length;
    const step = teamSize === undefined ? null : nextStep(steps, prefs.later);
    const putOffSteps = steps.filter((s) => !s.done && prefs.later.includes(s.id));

    // A step got done since this device last looked: celebrate it
    useEffect(() => {
        if (teamSize === undefined) return;
        const before = lastDoneCount(placeId);
        saveDoneCount(placeId, doneCount);
        if (before === null || doneCount <= before) return;
        const justDone = steps.filter((s) => s.done).map((s) => s.id).slice(-1)[0];
        celebrate("big");
        toast(doneCount === steps.length ? "All set up" : "Step done: " + STEP_NAMES[justDone ?? "recipes"],
            { sub: doneCount === steps.length ? "Agave is ready to work for you." : doneCount + " of " + steps.length + " steps" });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doneCount, teamSize]);

    function later(id: StepId) {
        putOff(placeId, id);
        toast("Saved for later", { sub: "It's at the bottom of Home when you want it.", tone: "info" });
    }

    // Day one, nothing in yet: just the first step, big
    if (db.recipes.length === 0 && step?.id === "recipes") {
        return (
            <div className="page home">
                <SetupDots steps={steps} now={step?.id ?? null} />
                <RecipesStep onNew={() => navigate("/recipes/" + createRecipe("New recipe") + "?edit=1")} big />
                <InviteLink />
            </div>
        );
    }

    const title = step ? "Home" : todayTitle(db);
    return (
        <div className="page home">
            <div className="home-head">
                <div>
                    <div className="muted small">
                        {session.bar?.name ?? "Your place"}{step ? " · step " + (doneCount + 1) + " of " + steps.length : " · " + todayDate()}
                    </div>
                    <h1>{title}</h1>
                </div>
            </div>

            {step?.id === "recipes" && <StepCard minutes="1 min a page" onLater={() => later("recipes")}><RecipesStep onNew={() => navigate("/recipes/" + createRecipe("New recipe") + "?edit=1")} /></StepCard>}
            {step?.id === "team" && (
                <StepCard minutes="1 minute" onLater={() => later("team")}>
                    <h2 className="step-title">Get your {db.recipes.length} {db.recipes.length === 1 ? "recipe" : "recipes"} on everyone's phone</h2>
                    <p className="step-body">Staff can look up recipes and specs, take quick quizzes, count and log waste. They never see costs or prices.</p>
                    <InviteCard compact />
                </StepCard>
            )}
            {step?.id === "costs" && <CostsStep db={db} onLater={() => later("costs")} />}
            {step?.id === "sales" && (
                <StepCard minutes="2 minutes" onLater={() => later("sales")}>
                    <h2 className="step-title">Which recipes make you the most money?</h2>
                    <p className="step-body">Connect your register. Agave pulls in what sold each day and puts it next to what each recipe costs: your real cost %, best sellers, and the ones losing you money.</p>
                    <div className="step-actions two">
                        <Link className="button" to="/sales">Connect Square</Link>
                        <Link className="button secondary-link" to="/sales">Upload a sales report</Link>
                    </div>
                    <p className="muted small step-note">Toast is coming. Until then, Toast's sales report uploads fine.</p>
                </StepCard>
            )}
            {step?.id === "count" && (
                <StepCard minutes="about 30 minutes, once" onLater={() => later("count")}>
                    <h2 className="step-title">Know what's on the shelf</h2>
                    <p className="step-body">Walk the place with your phone and count. Tap a bottle for open ones, or scan barcodes. Agave shows what it's all worth, and after the next count, what went missing.</p>
                    <div className="step-actions"><Link className="button" to="/counts">Start a count</Link></div>
                </StepCard>
            )}

            {!step && <Today db={db} />}

            <RecipeStrip db={db} />

            {putOffSteps.length > 0 && (
                <section className="card home-later">
                    <h2>Set up later</h2>
                    <ul className="plain-list">
                        {putOffSteps.map((s) => (
                            <li key={s.id}>
                                <span>{LATER_NAMES[s.id]}</span>
                                <button className="link-button" onClick={() => bringBack(placeId, s.id)}>Do it now</button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}


// ===== Steps =====

function SetupDots({ steps, now }: { steps: { id: StepId; done: boolean }[]; now: StepId | null }) {
    return (
        <div className="setup-dots" role="img" aria-label={steps.filter((s) => s.done).length + " of " + steps.length + " setup steps done"}>
            {steps.map((s) => <span key={s.id} className={s.done ? "done" : s.id === now ? "now" : ""} />)}
        </div>
    );
}

function StepCard({ minutes, onLater, children }: { minutes: string; onLater: () => void; children: ReactNode }) {
    return (
        <section className="card step-card">
            <div className="step-kicker">NEXT STEP · {minutes.toUpperCase()}</div>
            {children}
            <button className="link-button step-later" onClick={onLater}>Later</button>
        </section>
    );
}

function RecipesStep({ onNew, big = false, family = false }: { onNew: () => void; big?: boolean; family?: boolean }) {
    return (
        <div className={"recipes-step" + (big ? " big" : "")}>
            {big ? <h1>{family ? "Let's get your family's recipes in." : "Let's get your recipes in."}</h1> : <h2 className="step-title">Let's get your recipes in</h2>}
            <p className="step-body">{family
                ? "Cookbook pages, recipe cards, Grandma's handwriting. Keep them all in one place, on everyone's phone."
                : "Everything in Agave builds from your recipes: costs, training, counts and orders. Start with what you already have."}</p>
            <div className="start-ways">
                {cloudEnabled ? (
                    <Link to="/recipes/scan" className="start-way primary">
                        <span className="start-way-top">
                            <span className="start-way-icon"><Ic d="M4 8h3l2-3h6l2 3h3v11H4z M12 9.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7" /></span>
                            <span className="start-way-badge">FASTEST</span>
                        </span>
                        <strong>{family ? "Scan your recipes" : "Scan your recipe book"}</strong>
                        <span>Photograph the pages{family ? " or cards" : ""}. Agave types them in for you, about a minute a page.</span>
                    </Link>
                ) : null}
                {!family && (
                    <Link to="/classics" className="start-way">
                        <span className="start-way-icon"><Ic d="M5 4h14l-7 8z M12 12v7 M8 20h8" /></span>
                        <span><strong>Start from the classics</strong><span>Pick the ones you make, then make them yours</span></span>
                    </Link>
                )}
                <button className="start-way" onClick={onNew}>
                    <span className="start-way-icon"><Ic d="M12 5v14 M5 12h14" /></span>
                    <span><strong>Type one in</strong><span>{family ? "The one you know by heart" : "Your signature, to try it out"}</span></span>
                </button>
            </div>
            {!family && <Link to="/data" className="small start-import">Have a spreadsheet? Import it</Link>}
        </div>
    );
}

function InviteLink() {
    const session = useSession();
    if (session.mode !== "ready" || session.bar?.role === "staff") return null;
    return <p className="muted small home-invite-note">Want the team in from the start? Use the invite button at the top.</p>;
}

// The ingredient used in the most recipes, to make the payoff concrete
function busiestIngredient(db: Database): { name: string; count: number } | null {
    const uses = new Map<string, Set<string>>();
    for (const line of db.recipeLines) {
        if (!line.ingredientId) continue;
        if (!uses.has(line.ingredientId)) uses.set(line.ingredientId, new Set());
        uses.get(line.ingredientId)!.add(line.recipeId);
    }
    let best: { name: string; count: number } | null = null;
    for (const [id, recipes] of uses) {
        const ingredient = db.ingredients.find((i) => i.id === id);
        if (ingredient && (best === null || recipes.size > best.count)) best = { name: ingredient.name, count: recipes.size };
    }
    return best;
}

function CostsStep({ db, onLater }: { db: Database; onLater: () => void }) {
    const busiest = busiestIngredient(db);
    return (
        <StepCard minutes="3 minutes" onLater={onLater}>
            <h2 className="step-title">Want to know what each recipe costs you?</h2>
            <p className="step-body">Scan one invoice. Agave reads the prices and matches them to the ingredients in your recipes, so you never do the math by hand.</p>
            {busiest && (
                <div className="cost-preview" aria-hidden="true">
                    <span className="cost-preview-line">{busiest.name.toUpperCase()}<br />1 CS · $__.__</span>
                    <Ic d="M5 12h14 M13 6l6 6-6 6" />
                    <span className="cost-preview-match"><strong>{busiest.name}</strong><br />in {busiest.count} of your recipes</span>
                </div>
            )}
            <div className="step-actions">
                {cloudEnabled
                    ? <Link className="button" to="/invoices/scan">Scan an invoice</Link>
                    : <Link className="button" to="/products">Add your first product</Link>}
            </div>
            {cloudEnabled && <Link to="/products" className="small">No invoice handy? Type one price</Link>}
        </StepCard>
    );
}


// ===== Today (once set up) =====

function todayDate(): string {
    return new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

interface TodayItem {
    key: string;
    title: string;
    sub: string;
    to: string;
    tone: "good" | "warn";
    icon: string;
}

function todayItems(db: Database): TodayItem[] {
    const items: TodayItem[] = [];
    const waiting = db.invoices.filter((i) => i.status !== "approved");
    if (waiting.length > 0) {
        const total = waiting.reduce((s, i) => s + invoiceTotal(i.id), 0);
        items.push({
            key: "invoices", tone: "good", to: waiting.length === 1 ? "/invoices/" + waiting[0].id : "/invoices",
            title: waiting.length === 1 ? "Approve the " + (db.vendors.find((v) => v.id === waiting[0].vendorId)?.companyName ?? "") + " invoice" : "Approve " + waiting.length + " invoices",
            sub: formatMoney(total) + " · prices update when you approve",
            icon: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6"
        });
    }
    const open = db.stockCounts.filter((c) => c.status === "open");
    for (const count of open.slice(0, 1)) {
        const lines = db.countLines.filter((l) => l.countId === count.id).length;
        items.push({ key: "count", tone: "good", to: "/counts/" + count.id, title: "Finish " + count.name, sub: lines + " counted so far", icon: "M9 3h6v4l2 3v11H7V10l2-3z M7 14h10" });
    }
    for (const recipe of recipesOverTarget().slice(0, 2)) {
        const s = summarize(recipe);
        items.push({
            key: "over-" + recipe.id, tone: "warn", to: "/recipes/" + recipe.id,
            title: recipe.name + " is at " + formatPercent(s.ingredientRatio ?? 0),
            sub: formatMoney(Math.ceil(s.suggestedPrice)) + " would bring it to about " + formatPercent(s.ingredientCost / Math.ceil(s.suggestedPrice)),
            icon: "M4 17l6-6 4 4 6-6 M15 9h5v5"
        });
    }
    return items;
}

function todayTitle(db: Database): string {
    const n = todayItems(db).length;
    return n === 0 ? "All caught up" : n === 1 ? "1 thing today" : n + " things today";
}

function Today({ db }: { db: Database }) {
    const items = todayItems(db);
    if (items.length === 0) {
        return (
            <section className="card today-clear">
                <span className="today-icon good"><Ic d="M5 12.5l4.5 4.5L19 7.5" /></span>
                <span>Nothing needs you right now. Nice.</span>
            </section>
        );
    }
    return (
        <div className="today">
            {items.map((item) => (
                <Link key={item.key} to={item.to} className="card today-item">
                    <span className={"today-icon " + item.tone}><Ic d={item.icon} /></span>
                    <span className="today-text"><strong>{item.title}</strong><span>{item.sub}</span></span>
                    <Ic d="M9 5l7 7-7 7" />
                </Link>
            ))}
        </div>
    );
}


// ===== Recipes =====

const TINTS: Record<Recipe["type"], string> = { Cocktail: "#f3ead8", Dish: "#efe6da", Beer: "#f3f1dc", Prep: "#e6efe9" };

//     noCosts -> no cost chips (Just recipes); all -> every recipe, A to Z, not just 6
function RecipeStrip({ db, noCosts = false, all = false }: { db: Database; noCosts?: boolean; all?: boolean }) {
    const shown = useMemo(() => {
        const menuIds = new Set(db.menuItems.map((m) => m.recipeId));
        // Menu recipes first, then the rest; preps last
        const sorted = [...db.recipes]
            .sort((a, b) => all ? a.name.localeCompare(b.name) : Number(b.type !== "Prep") - Number(a.type !== "Prep") || Number(menuIds.has(b.id)) - Number(menuIds.has(a.id)) || a.name.localeCompare(b.name));
        return all ? sorted : sorted.slice(0, 6);
    }, [db.recipes, db.menuItems, all]);
    if (db.recipes.length === 0) return null;
    return (
        <section className="home-recipes">
            <div className="home-recipes-head">
                <span className="section-label">YOUR RECIPES · {db.recipes.length}</span>
                <Link to="/recipes">See all</Link>
            </div>
            <div className="recipe-tiles">
                {shown.map((recipe) => {
                    let pct: number | null = null;
                    let priced = false;
                    if (!noCosts) try {
                        const s = summarize(recipe);
                        priced = s.ingredientCost > 0;
                        pct = s.ingredientRatio;
                    } catch { /* a recipe that loops has no cost */ }
                    const over = pct !== null && pct > (recipe.type === "Dish" || recipe.type === "Prep" ? 0.35 : 0.25);
                    return (
                        <Link key={recipe.id} to={"/recipes/" + recipe.id} className="recipe-tile">
                            <span className="recipe-tile-art" style={{ background: TINTS[recipe.type] }}>
                                {recipe.photo ? <img src={recipe.photo} alt="" /> : null}
                            </span>
                            <strong>{recipe.name}</strong>
                            {noCosts ? null : !priced
                                ? <span className="cost-chip ghost" title="Costs show up once Agave has prices">$ ?</span>
                                : pct !== null
                                    ? <span className={"cost-chip" + (over ? " over" : "")}>{formatPercent(pct)}</span>
                                    : <span className="cost-chip plain">{formatMoney(summarize(recipe).ingredientCost)}</span>}
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}

function Ic({ d }: { d: string }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {d.split(" M").map((part, i) => <path key={i} d={(i === 0 ? "" : "M") + part} />)}
        </svg>
    );
}

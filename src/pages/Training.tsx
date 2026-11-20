// ===== Training.tsx =====
// Staff learn the house specs from the bar's own recipes.
//     Pick what to study: one menu, or every cocktail
//     FLASHCARDS   tap to flip, then "Got it" or "Again" (missed cards come back at the end)
//     QUIZ         10 multiple-choice questions, score at the end, review what was missed

import { useState } from "react";
import { Link } from "react-router";
import { useDb } from "../data/storage";
import { buildQuiz, cardsFor, notedProducts, shuffle, type Card, type Question } from "../data/training";

type Mode = "cards" | "quiz";

export default function Training() {
    const db = useDb();
    const [menuId, setMenuId] = useState<string>("all");
    const [mode, setMode] = useState<Mode>("cards");
    // A new key restarts the deck or quiz (React redraws it from scratch)
    const [round, setRound] = useState(0);

    const cards = cardsFor(menuId === "all" ? null : menuId).filter((c) => c.lines.length > 0);

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Training</h1>
                    <p className="muted">Learn the house specs. Cards come from your own recipes, so they're always current.</p>
                </div>
                <Link to="/classics" className="button secondary-link">Classics library</Link>
            </div>

            <div className="training-controls">
                <label className="form-field">
                    <span>Study</span>
                    <select value={menuId} onChange={(e) => { setMenuId(e.target.value); setRound(round + 1); }}>
                        <option value="all">Every cocktail</option>
                        {db.menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                </label>
                <div className="tab-row" role="tablist">
                    <button role="tab" aria-selected={mode === "cards"} className={"tab" + (mode === "cards" ? " active" : "")}
                        onClick={() => { setMode("cards"); setRound(round + 1); }}>Flashcards</button>
                    <button role="tab" aria-selected={mode === "quiz"} className={"tab" + (mode === "quiz" ? " active" : "")}
                        onClick={() => { setMode("quiz"); setRound(round + 1); }}>Quiz</button>
                </div>
            </div>

            {cards.length === 0 ? (
                <section className="card">
                    <p className="muted">No cocktails with a build to study yet. Add some <Link to="/recipes">recipes</Link>, or start from the <Link to="/classics">classics</Link>.</p>
                </section>
            ) : mode === "cards" ? (
                <Flashcards key={round} cards={cards} onRestart={() => setRound(round + 1)} />
            ) : (
                <Quiz key={round} cards={cards} withProducts={menuId === "all"} onRestart={() => setRound(round + 1)} />
            )}

            {mode === "quiz" && menuId === "all" && notedProducts().length >= 2 && (
                <p className="muted small">The quiz also asks about products with <Link to="/products">tasting notes</Link>.</p>
            )}
        </div>
    );
}


// ===== Flashcards =====

// The deck is a queue: "Got it" drops the card, "Again" moves it to the back
function Flashcards({ cards, onRestart }: { cards: Card[]; onRestart: () => void }) {
    const [queue, setQueue] = useState(() => shuffle(cards));
    const [flipped, setFlipped] = useState(false);
    const [known, setKnown] = useState(0);

    if (queue.length === 0) {
        return (
            <section className="card training-done">
                <h2>Deck done</h2>
                <p>You went through all {cards.length} cards.</p>
                <button onClick={onRestart}>Go again</button>
            </section>
        );
    }

    const card = queue[0];

    function next(gotIt: boolean) {
        setFlipped(false);
        if (gotIt) setKnown(known + 1);
        setQueue(gotIt ? queue.slice(1) : [...queue.slice(1), card]);
    }

    return (
        <div className="flash">
            <div className="flash-progress muted small">{known} of {cards.length} learned · {queue.length} to go</div>
            <button className={"flashcard" + (flipped ? " flipped" : "")} onClick={() => setFlipped(!flipped)}
                aria-label={flipped ? "Show the front" : "Show the spec"}>
                {!flipped ? (
                    <div className="flash-front">
                        <h2>{card.name}</h2>
                        {card.glass && <p className="muted">{card.glass}</p>}
                        <p className="muted small">Say the build, then tap to check</p>
                    </div>
                ) : (
                    <div className="flash-back">
                        <h2>{card.name}</h2>
                        <SpecDetails card={card} />
                    </div>
                )}
            </button>
            {flipped && (
                <div className="button-row flash-buttons">
                    <button className="secondary" onClick={() => next(false)}>Again</button>
                    <button onClick={() => next(true)}>Got it</button>
                </div>
            )}
        </div>
    );
}

function SpecDetails({ card }: { card: Card }) {
    return (
        <>
            <ul className="spec-build">
                {card.lines.map((l, i) => <li key={i}><span className="spec-amount">{l.amount}</span> {l.name}</li>)}
            </ul>
            <div className="spec-meta">
                {card.glass && <span><span className="field-label">Glass</span> {card.glass}</span>}
                {card.garnish && <span><span className="field-label">Garnish</span> {card.garnish}</span>}
            </div>
            {card.directions && <p className="small">{card.directions}</p>}
        </>
    );
}


// ===== Quiz =====

function Quiz({ cards, withProducts, onRestart }: { cards: Card[]; withProducts: boolean; onRestart: () => void }) {
    // Built once when the quiz starts (not on every redraw, or the questions would reshuffle)
    const [questions] = useState(() => buildQuiz(cards, withProducts));
    const [index, setIndex] = useState(0);
    const [picked, setPicked] = useState<number | null>(null);
    const [missed, setMissed] = useState<Question[]>([]);

    if (questions.length === 0) {
        return <section className="card"><p className="muted">Add a couple more recipes to make a quiz.</p></section>;
    }

    if (index >= questions.length) {
        const score = questions.length - missed.length;
        return (
            <section className="card training-done">
                <h2>{score} of {questions.length}</h2>
                <p>{score === questions.length ? "Perfect. You know the menu." : "Here's what to go over:"}</p>
                {missed.length > 0 && (
                    <ul className="missed-list">
                        {missed.map((q, i) => <li key={i}>{q.prompt} <strong>{q.choices[q.answer]}</strong></li>)}
                    </ul>
                )}
                <button onClick={onRestart}>New quiz</button>
            </section>
        );
    }

    const q = questions[index];
    const card = cards.find((c) => c.id === q.cardId) ?? null;

    function pick(choice: number) {
        if (picked !== null) return;
        setPicked(choice);
        if (choice !== q.answer) setMissed([...missed, q]);
    }

    function next() {
        setPicked(null);
        setIndex(index + 1);
    }

    return (
        <section className="card quiz">
            <div className="flash-progress muted small">Question {index + 1} of {questions.length}</div>
            <h2>{q.prompt}</h2>
            {q.detail.length > 0 && (
                <ul className="quiz-detail">
                    {q.detail.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
            )}
            <div className="quiz-choices">
                {q.choices.map((choice, i) => {
                    // After answering: the right one turns green, a wrong pick turns red
                    let state = "";
                    if (picked !== null && i === q.answer) state = " right";
                    else if (picked === i) state = " wrong";
                    return (
                        <button key={i} className={"quiz-choice" + state} disabled={picked !== null && state === ""} onClick={() => pick(i)}>
                            {choice}
                        </button>
                    );
                })}
            </div>
            {picked !== null && (
                <div className="quiz-feedback">
                    <p><strong>{picked === q.answer ? "Right." : "Not quite."}</strong></p>
                    {card && <div className="quiz-card"><h3>{card.name}</h3><SpecDetails card={card} /></div>}
                    <button onClick={next}>{index + 1 === questions.length ? "See score" : "Next"}</button>
                </div>
            )}
        </section>
    );
}

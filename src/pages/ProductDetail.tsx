// ===== ProductDetail.tsx =====
// One product, edited in place:
//     details        name, family, category, producer, ABV, which ingredient it counts as
//     formats        each way it's packed (1 L bottle), with its par and what's on hand
//         ways to buy   each purchase unit (case of 12 from a vendor), price, price history

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { db as database, useDb } from "../data/storage";
import { getOrCreateIngredient } from "../data/actions";
import {
    FAMILIES, addFormat, addPurchaseUnit, buyName, deleteFormat, deleteProduct, deletePurchaseUnit,
    deletePrice, priceHistory, recordPrice, updateFormat, updateIngredient, updateProduct, updatePurchaseUnit
} from "../data/library";
import { onHand, unitCost, unitWord } from "../data/inventory";
import { currentPrice } from "../data/prices";
import { formatName } from "../data/costing";
import { PURCHASE_UNITS } from "../data/units";
import { findById, formatAmount, formatDate, formatMoney } from "../data/utils";
import type { Format, Product, PurchaseUnit } from "../data/types";
import TextInput from "../components/TextInput";
import AmountInput from "../components/AmountInput";

export default function ProductDetail() {
    const db = useDb();
    const navigate = useNavigate();
    const { productId } = useParams();
    const product = findById(db.products, productId ?? null);

    if (product === null) {
        return (
            <div className="page">
                <h1>Product not found</h1>
                <Link to="/products">← Products</Link>
            </div>
        );
    }

    const formats = db.formats.filter((f) => f.productId === product.id);
    const ingredient = findById(db.ingredients, product.ingredientId);

    // Link the product to an ingredient by name (made if it doesn't exist), or unlink it if blank
    function setIngredient(name: string) {
        const ingredientId = name === "" ? null : getOrCreateIngredient(name).id;
        updateProduct(product!.id, { ingredientId });
    }

    function remove() {
        if (!confirm("Delete " + product!.name + " and all its prices?")) return;
        if (deleteProduct(product!.id)) navigate("/products");
        else alert(product!.name + " is on an order or invoice, so it's kept for your records.");
    }

    return (
        <div className="page">
            <Link to="/products" className="back">← Products</Link>
            <div className="page-header">
                <div>
                    <h1>{product.name}</h1>
                    <div className="tags">
                        <span className="tag">{product.family}</span>
                        {product.category && <span className="tag">{product.category}</span>}
                        {ingredient && <Link to={"/ingredients/" + ingredient.id} className="tag house">counts as {ingredient.name}</Link>}
                    </div>
                </div>
                <div className="button-row">
                    <button className="danger" onClick={remove}>Delete</button>
                </div>
            </div>

            <DetailsCard product={product} ingredientName={ingredient?.name ?? ""} onIngredient={setIngredient} />

            {formats.map((format) => (
                <FormatCard key={format.id} format={format} product={product} />
            ))}

            <div>
                <button className="secondary" onClick={() => addFormat(product.id)}>+ Add another format</button>
                <span className="muted small"> e.g. the same product in a 1.75 L bottle</span>
            </div>
        </div>
    );
}


// ----- Details -----

function DetailsCard({ product, ingredientName, onIngredient }: { product: Product; ingredientName: string; onIngredient: (name: string) => void }) {
    const update = (changes: Partial<Product>) => updateProduct(product.id, changes);
    return (
        <section className="card">
            <h2>Details</h2>
            <div className="form-grid">
                <label className="form-field span-2">
                    <span>Name</span>
                    <TextInput value={product.name} required onSave={(name) => update({ name })} />
                </label>
                <label className="form-field">
                    <span>Family</span>
                    <select value={product.family} onChange={(e) => update({ family: e.target.value })}>
                        {FAMILIES.map((f) => <option key={f}>{f}</option>)}
                    </select>
                </label>
                <label className="form-field">
                    <span>Category</span>
                    <TextInput value={product.category} placeholder="Rum" onSave={(category) => update({ category })} />
                </label>
                <label className="form-field">
                    <span>Subcategory</span>
                    <TextInput value={product.subcategory} placeholder="White" onSave={(subcategory) => update({ subcategory })} />
                </label>
                <label className="form-field">
                    <span>Producer</span>
                    <TextInput value={product.producer} placeholder="Distillery or brand" onSave={(producer) => update({ producer })} />
                </label>
                <label className="form-field">
                    <span>ABV %</span>
                    <AmountInput value={product.abv} allowBlank placeholder="40" onSave={(abv) => update({ abv })} />
                </label>
                <label className="form-field">
                    <span>Counts as ingredient</span>
                    <TextInput value={ingredientName} list="ingredient-names" placeholder="e.g. White rum" onSave={onIngredient} />
                </label>
            </div>
            <datalist id="ingredient-names">
                {database.ingredients.map((i) => <option key={i.id} value={i.name} />)}
            </datalist>
            <p className="muted small">
                Recipes ask for ingredients ("White rum"). Linking this product lets recipes cost it.
            </p>
        </section>
    );
}


// ----- One format with its ways to buy -----

function FormatCard({ format, product }: { format: Format; product: Product }) {
    const units = database.purchaseUnits.filter((u) => u.formatId === format.id);
    const ingredient = findById(database.ingredients, product.ingredientId);
    const cost = unitCost(format.id);
    const have = onHand(format.id);
    const word = unitWord(format);
    const update = (changes: Partial<Format>) => updateFormat(format.id, changes);

    function remove() {
        if (!confirm("Remove the " + formatName(format) + " format and its prices?")) return;
        if (!deleteFormat(format.id)) alert("This format is on an order or invoice, so it's kept for your records.");
    }

    return (
        <section className="card">
            <div className="card-header">
                <h2>{formatName(format)}</h2>
                <button className="secondary icon-button" onClick={remove}>Remove format</button>
            </div>

            <div className="form-grid four">
                <label className="form-field">
                    <span>Size</span>
                    <AmountInput value={format.unitSize} onSave={(v) => v !== null && v > 0 && update({ unitSize: v })} />
                </label>
                <label className="form-field">
                    <span>Unit</span>
                    <select value={format.sizeUnit} onChange={(e) => update({ sizeUnit: e.target.value })}>
                        {PURCHASE_UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                </label>
                <label className="form-field">
                    <span>Packaging</span>
                    <TextInput value={format.packaging} placeholder="bottle, can, bag, keg" onSave={(packaging) => update({ packaging })} />
                </label>
                <label className="form-field">
                    <span>Usable %</span>
                    <AmountInput value={format.yieldPercent} onSave={(v) => v !== null && v > 0 && v <= 100 && update({ yieldPercent: v })} />
                </label>
                <label className="form-field">
                    <span>Par ({word}s to keep)</span>
                    <AmountInput value={format.par} allowBlank placeholder="None" onSave={(par) => update({ par })} />
                </label>
                <div className="form-field">
                    <span>On hand</span>
                    <strong className={have !== null && format.par !== null && have < format.par ? "warn" : ""}>
                        {have === null ? "Not counted yet" : formatAmount(have) + " " + word + (have === 1 ? "" : "s")}
                    </strong>
                </div>
                <div className="form-field">
                    <span>Cost per {word}</span>
                    <strong>{cost === null ? "No price yet" : formatMoney(cost)}</strong>
                </div>
            </div>

            <h3>Ways to buy</h3>
            {units.length === 0 ? (
                <p className="muted">No way to buy this yet. Add one to give it a price.</p>
            ) : (
                <div className="table-scroll">
                    <table className="table compact">
                        <thead>
                            <tr>
                                <th>Buy as</th>
                                <th>{word}s in it</th>
                                <th>Vendor</th>
                                <th>SKU</th>
                                <th className="num">Price</th>
                                <th>New price</th>
                                <th className="num">Per {word}</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {units.map((unit) => (
                                <UnitRow key={unit.id} unit={unit} word={word}
                                    isHouse={ingredient !== null && ingredient.housePurchaseUnitId === unit.id}
                                    onMakeHouse={ingredient === null ? null : () => updateIngredient(ingredient.id, { housePurchaseUnitId: unit.id, houseRecipeId: null })} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <button className="secondary" onClick={() => addPurchaseUnit(format.id)}>+ Add a way to buy</button>
        </section>
    );
}


// ----- One purchase unit row (+ its price history when opened) -----

interface UnitRowProps {
    unit: PurchaseUnit;
    word: string;
    isHouse: boolean;
    onMakeHouse: (() => void) | null;
}

function UnitRow({ unit, word, isHouse, onMakeHouse }: UnitRowProps) {
    const [showHistory, setShowHistory] = useState(false);
    const price = currentPrice(unit.id);
    const history = priceHistory(unit.id);
    const update = (changes: Partial<PurchaseUnit>) => updatePurchaseUnit(unit.id, changes);

    function remove() {
        if (!confirm("Remove " + buyName(unit) + " and its prices?")) return;
        if (!deletePurchaseUnit(unit.id)) alert("This is on an order or invoice, so it's kept for your records.");
    }

    return (
        <>
            <tr>
                <td>
                    <TextInput value={unit.name} required className="narrow" onSave={(name) => update({ name })} ariaLabel="Buy as" />
                    {isHouse && <span className="tag house">house</span>}
                    {!isHouse && onMakeHouse && <button className="link-button" onClick={onMakeHouse}>make house</button>}
                </td>
                <td><AmountInput value={unit.unitAmount} className="qty-input" ariaLabel="Units in it"
                    onSave={(v) => v !== null && v > 0 && update({ unitAmount: v })} /></td>
                <td>
                    <select value={unit.vendorId ?? ""} aria-label="Vendor" onChange={(e) => update({ vendorId: e.target.value || null })}>
                        <option value="">No vendor</option>
                        {database.vendors.map((v) => <option key={v.id} value={v.id}>{v.companyName}</option>)}
                    </select>
                </td>
                <td><TextInput value={unit.sku} className="narrow" placeholder="—" ariaLabel="SKU" onSave={(sku) => update({ sku })} /></td>
                <td className="num">
                    {price > 0 ? formatMoney(price) : <span className="muted">—</span>}
                    {history.length > 0 && (
                        <div><button className="link-button" onClick={() => setShowHistory(!showHistory)}>
                            {showHistory ? "hide" : "history (" + history.length + ")"}
                        </button></div>
                    )}
                </td>
                <td>
                    {/* The key changes after each new price, which empties the box */}
                    <AmountInput key={history.length} value={null} money allowBlank placeholder="0.00" className="qty-input"
                        ariaLabel="New price" onSave={(v) => v !== null && v > 0 && recordPrice(unit.id, v)} />
                </td>
                <td className="num">{price > 0 && unit.unitAmount > 0 ? formatMoney(price / unit.unitAmount) : "—"}</td>
                <td className="num"><button className="danger icon-button" aria-label="Remove" onClick={remove}>✕</button></td>
            </tr>
            {showHistory && (
                <tr className="history-row">
                    <td colSpan={8}>
                        <ul className="history">
                            {history.map((entry, i) => (
                                <li key={entry.id}>
                                    <span>{formatDate(entry.recordedAt)}</span>
                                    <strong>{formatMoney(entry.amount)}</strong>
                                    {i === 0 && <span className="tag">current</span>}
                                    <button className="link-button" onClick={() => deletePrice(entry.id)}>delete</button>
                                </li>
                            ))}
                        </ul>
                        <span className="muted small"> per {buyName(unit)} ({word}s)</span>
                    </td>
                </tr>
            )}
        </>
    );
}

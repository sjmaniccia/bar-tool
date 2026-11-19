// ===== purchasing.ts =====
// Orders and invoices.
//
//     ORDER    draft -> sent -> received        what you asked the vendor for
//     INVOICE  unreconciled -> reconciled -> approved
//              what they actually delivered and charged.
//              Approving records each line's price as the new current price,
//              so recipe costs update from real invoices.

import { db, commit } from "./storage";
import { currentPrice, addPrice } from "./prices";
import { latestClosedCount, onHand } from "./inventory";
import { findById, makeId, now, today } from "./utils";
import type { Invoice, InvoiceStatus, Order, OrderStatus, PurchaseUnit } from "./types";


// ===== Orders =====

export function createOrder(vendorId: string): string {
    const order: Order = { id: makeId(), vendorId, status: "draft", createdAt: today(), note: "" };
    db.orders.push(order);
    commit();
    return order.id;
}

export function updateOrder(orderId: string, changes: Partial<Order>) {
    const order = findById(db.orders, orderId);
    if (order === null) return;
    Object.assign(order, changes);
    commit();
}

export function setOrderStatus(orderId: string, status: OrderStatus) {
    updateOrder(orderId, { status });
}

export function deleteOrder(orderId: string) {
    db.orders = db.orders.filter((o) => o.id !== orderId);
    db.orderLines = db.orderLines.filter((l) => l.orderId !== orderId);
    for (const invoice of db.invoices) {
        if (invoice.orderId === orderId) invoice.orderId = null;
    }
    commit();
}

// Set how many of a purchase unit to order (0 removes the line)
export function setOrderQuantity(orderId: string, purchaseUnitId: string, quantity: number) {
    const line = db.orderLines.find((l) => l.orderId === orderId && l.purchaseUnitId === purchaseUnitId);
    if (quantity <= 0) {
        db.orderLines = db.orderLines.filter((l) => l !== line);
    } else if (line !== undefined) {
        line.quantity = quantity;
    } else {
        db.orderLines.push({ id: makeId(), orderId, purchaseUnitId, quantity });
    }
    commit();
}

// Order total at today's prices
export function orderTotal(orderId: string): number {
    let total = 0;
    for (const line of db.orderLines) {
        if (line.orderId === orderId) total += line.quantity * currentPrice(line.purchaseUnitId);
    }
    return total;
}


// ===== Suggestions from pars =====

export interface Suggestion {
    unit: PurchaseUnit;
    quantity: number;     // how many purchase units to order
    onHand: number;       // from the latest finished count
    incoming: number;     // already ordered, or delivered since that count
    par: number;
}

// Units of a format that are already coming or came in after the latest count
//     on order  = lines on draft or sent orders
//     delivered = invoice lines dated on or after the count (the count didn't see them)
// so ordering everything below par makes the suggestions go away
export function incomingUnits(formatId: string): number {
    const latest = latestClosedCount();
    let total = 0;
    for (const line of db.orderLines) {
        const order = findById(db.orders, line.orderId);
        const unit = findById(db.purchaseUnits, line.purchaseUnitId);
        if (order === null || unit === null || unit.formatId !== formatId) continue;
        if (order.status === "draft" || order.status === "sent") total += line.quantity * unit.unitAmount;
    }
    for (const line of db.invoiceLines) {
        const invoice = findById(db.invoices, line.invoiceId);
        const unit = findById(db.purchaseUnits, line.purchaseUnitId);
        if (invoice === null || unit === null || unit.formatId !== formatId) continue;
        if (latest !== null && invoice.invoiceDate >= latest.countedAt) total += line.quantity * unit.unitAmount;
    }
    return total;
}

// The purchase unit to reorder a format with, from one vendor
//     the ingredient's house choice IF it's from this vendor, ELSE the biggest pack they sell
function reorderUnit(formatId: string, vendorId: string): PurchaseUnit | null {
    const format = findById(db.formats, formatId);
    const product = findById(db.products, format?.productId ?? null);
    const ingredient = findById(db.ingredients, product?.ingredientId ?? null);
    let best: PurchaseUnit | null = null;
    for (const unit of db.purchaseUnits) {
        if (unit.formatId !== formatId || unit.vendorId !== vendorId) continue;
        if (ingredient !== null && ingredient.housePurchaseUnitId === unit.id) return unit;
        if (best === null || unit.unitAmount > best.unitAmount) best = unit;
    }
    return best;
}

// What to order, per vendor, to bring everything back up to par
//     FOR each format with a par that's below par on the latest closed count:
//         need = par - on hand - already incoming
//         order enough purchase units to cover it (rounded up)
//     A format sold by several vendors goes to the vendor of the house choice, else the first one
export function suggestions(): Map<string, Suggestion[]> {
    const byVendor = new Map<string, Suggestion[]>();
    for (const format of db.formats) {
        if (format.par === null || format.par <= 0) continue;
        const have = onHand(format.id);
        if (have === null) continue;
        const incoming = incomingUnits(format.id);
        if (have + incoming >= format.par) continue;
        const vendorIds = vendorsFor(format.id);
        if (vendorIds.length === 0) continue;
        const unit = reorderUnit(format.id, vendorIds[0]);
        if (unit === null || unit.unitAmount <= 0) continue;
        const quantity = Math.ceil((format.par - have - incoming) / unit.unitAmount);
        const list = byVendor.get(unit.vendorId!) ?? [];
        list.push({ unit, quantity, onHand: have, incoming, par: format.par });
        byVendor.set(unit.vendorId!, list);
    }
    return byVendor;
}

// Vendors that sell a format, house choice's vendor first
function vendorsFor(formatId: string): string[] {
    const format = findById(db.formats, formatId);
    const product = findById(db.products, format?.productId ?? null);
    const ingredient = findById(db.ingredients, product?.ingredientId ?? null);
    const house = findById(db.purchaseUnits, ingredient?.housePurchaseUnitId ?? null);
    const ids: string[] = [];
    if (house !== null && house.formatId === formatId && house.vendorId !== null) ids.push(house.vendorId);
    for (const unit of db.purchaseUnits) {
        if (unit.formatId === formatId && unit.vendorId !== null && !ids.includes(unit.vendorId)) ids.push(unit.vendorId);
    }
    return ids;
}

// Turn the suggestions into one draft order per vendor, and return how many were made
export function createSuggestedOrders(): number {
    let made = 0;
    for (const [vendorId, list] of suggestions()) {
        const order: Order = { id: makeId(), vendorId, status: "draft", createdAt: today(), note: "Suggested from pars" };
        db.orders.push(order);
        for (const s of list) {
            db.orderLines.push({ id: makeId(), orderId: order.id, purchaseUnitId: s.unit.id, quantity: s.quantity });
        }
        made++;
    }
    if (made > 0) commit();
    return made;
}

// How many single units a quantity of purchase units is ("2 cases" -> 24 bottles)
export function unitsIn(unit: PurchaseUnit, quantity: number): number {
    return unit.unitAmount * quantity;
}


// ===== Invoices =====

export function createInvoice(vendorId: string, orderId: string | null = null): string {
    const invoice: Invoice = {
        id: makeId(), vendorId, orderId, number: "", invoiceDate: today(), status: "unreconciled", note: ""
    };
    db.invoices.push(invoice);
    commit();
    return invoice.id;
}

// Mark an order received and start its invoice, filled in with the order's lines at today's prices
export function receiveOrder(orderId: string): string | null {
    const order = findById(db.orders, orderId);
    if (order === null) return null;
    order.status = "received";
    const invoice: Invoice = {
        id: makeId(), vendorId: order.vendorId, orderId, number: "", invoiceDate: today(), status: "unreconciled", note: ""
    };
    db.invoices.push(invoice);
    for (const line of db.orderLines.filter((l) => l.orderId === orderId)) {
        db.invoiceLines.push({
            id: makeId(), invoiceId: invoice.id, purchaseUnitId: line.purchaseUnitId,
            quantity: line.quantity, unitPrice: currentPrice(line.purchaseUnitId)
        });
    }
    commit();
    return invoice.id;
}

export function updateInvoice(invoiceId: string, changes: Partial<Invoice>) {
    const invoice = findById(db.invoices, invoiceId);
    if (invoice === null || invoice.status === "approved") return;
    Object.assign(invoice, changes);
    commit();
}

export function deleteInvoice(invoiceId: string) {
    db.invoices = db.invoices.filter((i) => i.id !== invoiceId);
    db.invoiceLines = db.invoiceLines.filter((l) => l.invoiceId !== invoiceId);
    commit();
}

// Add a line (starts at today's price) to an invoice that isn't approved yet
export function addInvoiceLine(invoiceId: string, purchaseUnitId: string) {
    const invoice = findById(db.invoices, invoiceId);
    if (invoice === null || invoice.status === "approved") return;
    db.invoiceLines.push({ id: makeId(), invoiceId, purchaseUnitId, quantity: 1, unitPrice: currentPrice(purchaseUnitId) });
    commit();
}

export function updateInvoiceLine(lineId: string, changes: { quantity?: number; unitPrice?: number }) {
    const line = findById(db.invoiceLines, lineId);
    const invoice = findById(db.invoices, line?.invoiceId ?? null);
    if (line === null || invoice === null || invoice.status === "approved") return;
    Object.assign(line, changes);
    commit();
}

export function removeInvoiceLine(lineId: string) {
    db.invoiceLines = db.invoiceLines.filter((l) => l.id !== lineId);
    commit();
}

export function invoiceTotal(invoiceId: string): number {
    let total = 0;
    for (const line of db.invoiceLines) {
        if (line.invoiceId === invoiceId) total += line.quantity * line.unitPrice;
    }
    return total;
}

// Move an invoice between unreconciled and reconciled (approved is final)
export function setInvoiceStatus(invoiceId: string, status: Exclude<InvoiceStatus, "approved">) {
    updateInvoice(invoiceId, { status });
}

// Approve an invoice
//     FOR each line whose price differs from the current price: record it as the new price
//     Then lock the invoice. Returns how many prices changed.
export function approveInvoice(invoiceId: string): number {
    const invoice = findById(db.invoices, invoiceId);
    if (invoice === null || invoice.status === "approved") return 0;
    let changed = 0;
    const when = now();
    for (const line of db.invoiceLines) {
        if (line.invoiceId !== invoiceId) continue;
        if (Math.abs(line.unitPrice - currentPrice(line.purchaseUnitId)) >= 0.005) {
            addPrice(line.purchaseUnitId, line.unitPrice, when);
            changed++;
        }
    }
    invoice.status = "approved";
    commit();
    return changed;
}

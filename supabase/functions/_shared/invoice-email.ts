// ===== invoice-email.ts =====
// The copy of a scanned invoice that goes to a bar's owners (invoice-copy function).
// Kept apart from the function so it can be tested without sending anything.
//
//     SUBJECT  "Invoice from Southern Wine · $1,284.50 · Shady's Corner"
//     BODY     who scanned it, vendor, number, date, every line, the total
//              the photos are attachments (added by the function)
//     FOOTER   "Shouldn't be getting these?" -> hand the place over to its real owner,
//              from the Account page (a link; they still have to sign in)

export interface InvoiceLineCopy {
    name: string;
    quantity: number;
    unitPrice: number;
    amount: number;
}

export interface InvoiceCopy {
    barName: string;
    scannedBy: string;          // name or email of whoever scanned it
    vendor: string;
    number: string;
    date: string;               // as printed / entered, e.g. "2026-11-27"
    lines: InvoiceLineCopy[];
    charges: { name: string; amount: number }[];   // delivery, deposits, fuel...
    total: number;
    accountUrl: string;         // where "here" goes: the Account page
}

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Anything printed or typed goes in as text, never as HTML
function esc(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Trim what came from the phone: a name, a number
const clean = (text: unknown, max: number) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function invoiceEmail(copy: InvoiceCopy) {
    const vendor = clean(copy.vendor, 80) || "a vendor";
    const bar = clean(copy.barName, 100);
    const subject = "Invoice from " + vendor + " · " + money(copy.total) + " · " + bar;
    const heading = [copy.number && "#" + clean(copy.number, 40), clean(copy.date, 20)].filter(Boolean).join(" · ");

    const text = [
        clean(copy.scannedBy, 100) + " scanned an invoice into Agave for " + bar + ".",
        "",
        vendor + (heading ? "  " + heading : ""),
        ...copy.lines.map((l) => "  " + clean(l.name, 120) + "  " + l.quantity + " × " + money(l.unitPrice) + " = " + money(l.amount)),
        ...copy.charges.map((c) => "  " + clean(c.name, 80) + "  " + money(c.amount)),
        "  Total  " + money(copy.total),
        "",
        "The photos are attached.",
        "",
        "—",
        "Shouldn't be getting this email? You're listed as the owner of " + bar + " in Agave.",
        "If you set it up for someone else, hand it over to them in your account settings: " + copy.accountUrl
    ].join("\n");

    const row = (cells: string[], bold = false) =>
        "<tr>" + cells.map((c, i) => '<td style="padding:6px 8px;border-bottom:1px solid #eee;' + (i > 0 ? "text-align:right;" : "") + (bold ? "font-weight:700;" : "") + '">' + c + "</td>").join("") + "</tr>";
    const html = '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1c1a;max-width:620px">'
        + "<p>" + esc(clean(copy.scannedBy, 100)) + " scanned an invoice into Agave for <strong>" + esc(bar) + "</strong>.</p>"
        + '<h2 style="margin:18px 0 4px">' + esc(vendor) + "</h2>"
        + (heading ? '<p style="margin:0 0 10px;color:#666">' + esc(heading) + "</p>" : "")
        + '<table style="border-collapse:collapse;width:100%;font-size:14px">'
        + row(["Item", "Qty", "Each", "Amount"].map((h) => '<span style="color:#666">' + h + "</span>"))
        + copy.lines.map((l) => row([esc(clean(l.name, 120)), String(l.quantity), money(l.unitPrice), money(l.amount)])).join("")
        + copy.charges.map((c) => row([esc(clean(c.name, 80)), "", "", money(c.amount)])).join("")
        + row(["Total", "", "", money(copy.total)], true)
        + "</table>"
        + '<p style="color:#666">The photos are attached.</p>'
        + '<hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px">'
        + '<p style="font-size:13px;color:#666">Shouldn\'t be getting this email? You\'re listed as the owner of ' + esc(bar)
        + ' in Agave. If you set it up for someone else, hand it over to them in your account settings <a href="' + esc(copy.accountUrl) + '">here</a>.</p>'
        + "</div>";

    return { subject, text, html };
}

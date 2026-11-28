import { describe, expect, test } from "vitest";
import { invoiceEmail } from "./invoice-email";

const copy = {
    barName: "Shady's Corner",
    scannedBy: "Jordan",
    vendor: "Southern <Wine>",
    number: "88412",
    date: "2026-11-27",
    lines: [{ name: "Tito's 1L", quantity: 6, unitPrice: 21.5, amount: 129 }],
    charges: [{ name: "Delivery", amount: 15 }],
    total: 144,
    accountUrl: "https://example.com/#/account"
};

describe("invoice copy email", () => {
    test("subject, lines, total and the hand-over note", () => {
        const mail = invoiceEmail(copy);
        expect(mail.subject).toBe("Invoice from Southern <Wine> · $144.00 · Shady's Corner");
        expect(mail.text).toContain("Tito's 1L  6 × $21.50 = $129.00");
        expect(mail.text).toContain("Delivery  $15.00");
        expect(mail.text).toContain("Shouldn't be getting this email?");
        expect(mail.text).toContain("https://example.com/#/account");
        expect(mail.html).toContain('<a href="https://example.com/#/account">here</a>');
    });
    test("printed text can't become HTML", () => {
        const mail = invoiceEmail({ ...copy, lines: [{ name: "<script>x</script>", quantity: 1, unitPrice: 1, amount: 1 }] });
        expect(mail.html).not.toContain("<script>");
        expect(mail.html).toContain("Southern &lt;Wine&gt;");
    });
});

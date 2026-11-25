import { describe, expect, test } from "vitest";
import { feedbackEmail } from "./feedback-email";

describe("feedback email", () => {
    test("subject says what kind and starts the message; reply goes to the sender", () => {
        const mail = feedbackEmail({
            kind: "problem", message: "The scan button is hard to find on my phone, I looked everywhere for it.\nSecond line",
            email: "staff@bar.com", placeName: "Shady's", page: "/recipes", app: "iPhone app"
        });
        expect(mail.subject).toBe("[Agave problem] The scan button is hard to find on my phone, I looked eve…");
        expect(mail.replyTo).toBe("staff@bar.com");
        expect(mail.text).toContain("Second line");
        expect(mail.text).toContain("Place: Shady's");
        expect(mail.text).toContain("Page: /recipes");
    });

    test("missing details still make a readable email", () => {
        const mail = feedbackEmail({ kind: "other", message: "hi", email: "", placeName: "", page: "", app: "" });
        expect(mail.subject).toBe("[Agave feedback] hi");
        expect(mail.replyTo).toBeUndefined();
        expect(mail.text).toContain("From: unknown");
    });
});

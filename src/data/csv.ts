// ===== csv.ts =====
// Reading and writing CSV files (what every POS and spreadsheet can export).
//
//     parseCsv   text -> rows of cells, handling "quoted, values" and "" inside quotes
//     toCsv      rows -> text, quoting anything with a comma, quote or line break
//     download   hands a file to the browser to save

// Split CSV text into rows of cells
//     Walk the text one character at a time:
//         inside quotes: "" is a quote, a lone " ends the quotes
//         outside quotes: , ends a cell, a line break ends a row
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    const clean = text.replace(/^﻿/, "");   // drop the invisible mark Excel puts at the start
    for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (quoted) {
            if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"') {
            quoted = true;
        } else if (ch === ",") {
            row.push(cell);
            cell = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && clean[i + 1] === "\n") i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += ch;
        }
    }
    if (cell !== "" || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));   // skip blank lines
}

// Turn "$1,234.50" or "(12.00)" into a number (NaN if it isn't one)
export function parseMoney(text: string): number {
    const trimmed = text.trim();
    const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith("-");
    const digits = trimmed.replace(/[^0-9.]/g, "");
    if (digits === "") return NaN;
    const value = parseFloat(digits);
    return negative ? -value : value;
}

// Which column most likely holds something, from its header words
//     e.g. findColumn(headers, ["qty", "quantity", "sold"]) -> 2
export function findColumn(headers: string[], words: string[]): number {
    const lower = headers.map((h) => h.trim().toLowerCase());
    for (const word of words) {
        const exact = lower.indexOf(word);
        if (exact !== -1) return exact;
    }
    for (const word of words) {
        const partial = lower.findIndex((h) => h.includes(word));
        if (partial !== -1) return partial;
    }
    return -1;
}

// Rows of values -> CSV text
export function toCsv(rows: (string | number | null)[][]): string {
    return rows.map((row) => row.map((value) => {
        const text = value === null ? "" : String(value);
        return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }).join(",")).join("\n");
}

// Hand a file to the browser to save
export function download(fileName: string, content: string, type = "text/csv") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Read a file the person picked
export function readFile(file: File): Promise<string> {
    return file.text();
}

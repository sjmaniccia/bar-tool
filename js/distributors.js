// ===== distributors.js =====
// Everything for the Distributors screen: the form, the list,
// adding, editing and deleting.

import { db, commit } from "./storage.js";
import {
    makeId, findById, readField, writeField,
    makeElement, makePhoneLink, makeButton, resetList
} from "./utils.js";

const US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
    "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
    "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
    "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
    "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

// Form field ids, matched to the distributor's property names.
// Lets us read, fill and clear the form with one loop each.
const FORM_FIELDS = {
    companyName: "d-company-name",
    companyPhone: "d-company-phone",
    street: "d-street",
    city: "d-city",
    state: "d-state",
    zip: "d-zip",
    repName: "d-rep-name",
    repPhone: "d-rep-phone"
};

// When this holds an ID, the form is editing instead of adding
let editingId = null;


// ----- Data -----

export function sortedDistributors() {
    return db.distributors.slice().sort(function (a, b) {
        return a.companyName.localeCompare(b.companyName);
    });
}

function saveDistributor(fields) {
    if (editingId === null) {
        fields.id = makeId();
        db.distributors.push(fields);
    } else {
        const distributor = findById(db.distributors, editingId);
        if (distributor !== null) {
            Object.assign(distributor, fields); // copy new values onto the old row
        }
    }
    stopEditing();
    commit();
}

function deleteDistributor(id) {
    const distributor = findById(db.distributors, id);
    if (distributor === null) {
        return;
    }

    // Don't leave items pointing at a distributor that no longer exists
    let itemsUsingIt = 0;
    for (const item of db.items) {
        if (item.distributorId === id) {
            itemsUsingIt++;
        }
    }
    if (itemsUsingIt > 0) {
        alert("Can't delete " + distributor.companyName + ". "
            + itemsUsingIt + " item(s) still use it.");
        return;
    }

    if (!confirm("Delete " + distributor.companyName + "?")) {
        return;
    }
    db.distributors = db.distributors.filter(function (d) {
        return d.id !== id;
    });
    if (editingId === id) {
        stopEditing();
    }
    commit();
}


// ----- Form -----

function readForm() {
    const fields = {};
    for (const [property, fieldId] of Object.entries(FORM_FIELDS)) {
        fields[property] = readField(fieldId);
    }
    return fields;
}

// Fill the form with an existing distributor, e.g. to swap in a new rep
function startEditing(id) {
    const distributor = findById(db.distributors, id);
    if (distributor === null) {
        return;
    }
    editingId = id;

    for (const [property, fieldId] of Object.entries(FORM_FIELDS)) {
        writeField(fieldId, distributor[property]);
    }
    setFormMode("Edit distributor", "Save changes", true);
    document.getElementById("distributor-form").scrollIntoView({ behavior: "smooth" });
}

function stopEditing() {
    editingId = null;
    document.getElementById("distributor-form").reset();
    setFormMode("Add a distributor", "Add distributor", false);
}

function setFormMode(title, buttonText, showCancel) {
    document.getElementById("distributor-form-title").textContent = title;
    document.getElementById("distributor-submit").textContent = buttonText;
    document.getElementById("distributor-cancel").hidden = !showCancel;
}


// ----- Drawing -----

// "1234 Main St, Chattanooga, TN 37402", skipping blank parts
function formatAddress(d) {
    const parts = [];
    if (d.street) parts.push(d.street);
    if (d.city) parts.push(d.city);
    parts.push((d.state + " " + d.zip).trim());
    return parts.join(", ");
}

function makeDistributorItem(d) {
    const item = makeElement("li", "item");
    const info = makeElement("div");

    info.append(makeElement("strong", "", d.companyName));
    info.append(makeElement("span", "details", formatAddress(d)));

    if (d.companyPhone) {
        const phoneLine = makeElement("span", "details", "Office: ");
        phoneLine.append(makePhoneLink(d.companyPhone));
        info.append(phoneLine);
    }

    if (d.repName || d.repPhone) {
        const repLine = makeElement("span", "details", "Rep: " + d.repName);
        if (d.repPhone) {
            repLine.append(" · ", makePhoneLink(d.repPhone));
        }
        info.append(repLine);
    }

    const buttons = makeElement("div", "buttons");
    buttons.append(
        makeButton("Edit", "secondary", function () { startEditing(d.id); }),
        makeButton("Delete", "danger", function () { deleteDistributor(d.id); })
    );

    item.append(info, buttons);
    return item;
}

export function renderDistributors() {
    const list = resetList("distributor-list", "distributor-empty", db.distributors.length);
    for (const d of sortedDistributors()) {
        list.append(makeDistributorItem(d));
    }
}


// ----- Setup (runs once on page load) -----

export function initDistributors() {
    // Fill the state dropdown
    const stateSelect = document.getElementById("d-state");
    stateSelect.append(new Option("--", ""));
    for (const code of US_STATES) {
        stateSelect.append(new Option(code, code));
    }

    document.getElementById("distributor-form").addEventListener("submit", function (event) {
        event.preventDefault(); // stop the page from reloading
        const fields = readForm();
        if (fields.companyName === "" || fields.state === "") {
            return;
        }
        saveDistributor(fields);
    });

    document.getElementById("distributor-cancel").addEventListener("click", stopEditing);
}

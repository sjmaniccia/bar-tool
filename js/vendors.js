// ===== vendors.js =====
// The Vendors screen: add, edit, delete, and list vendors.
// Phones and ZIP are stored as text (no math on them, and they can have dashes).

import { db, commit } from "./storage.js";
import {
    makeId, findById, readField, writeField,
    makeElement, makePhoneLink, makeButton, resetList
} from "./utils.js";


// State choices (a dropdown keeps "TN" from also being typed as "Tenn")
const US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
    "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
    "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
    "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
    "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

// Each vendor field and its form box id (lets one loop handle every field)
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

// null = the form adds a new vendor, an id = the form edits that one
let editingId = null;


// ===== Data =====

// All vendors, A-Z by company name (copy first so the saved order doesn't change)
export function sortedVendors() {
    return db.vendors.slice().sort(function (a, b) {
        return a.companyName.localeCompare(b.companyName);
    });
}

// Save the form
//     IF adding, create a new vendor
//     ELSE copy the new values onto the one being edited
function saveVendor(fields) {
    if (editingId === null) {
        fields.id = makeId();
        db.vendors.push(fields);
    } else {
        const vendor = findById(db.vendors, editingId);
        if (vendor !== null) {
            Object.assign(vendor, fields);
        }
    }
    stopEditing();
    commit();
}

// Delete a vendor
//     IF any items still use it, refuse
//     ELSE ask to confirm, then delete
function deleteVendor(id) {
    const vendor = findById(db.vendors, id);
    if (vendor === null) {
        return;
    }

    // Count purchase units bought from this vendor
    let unitsUsingIt = 0;
    for (const unit of db.purchaseUnits) {
        if (unit.vendorId === id) {
            unitsUsingIt++;
        }
    }
    if (unitsUsingIt > 0) {
        alert("Can't delete " + vendor.companyName + ". "
            + unitsUsingIt + " purchase unit(s) still use it.");
        return;
    }

    if (!confirm("Delete " + vendor.companyName + "?")) {
        return;   // they clicked Cancel
    }

    // Keep every vendor except this one
    db.vendors = db.vendors.filter(function (d) {
        return d.id !== id;
    });
    if (editingId === id) {
        stopEditing();
    }
    commit();
}


// ===== The form =====

// Read every form box into one object
function readForm() {
    const fields = {};
    for (const [property, fieldId] of Object.entries(FORM_FIELDS)) {
        fields[property] = readField(fieldId);
    }
    return fields;
}

// Fill the form with a vendor so it can be edited
function startEditing(id) {
    const vendor = findById(db.vendors, id);
    if (vendor === null) {
        return;
    }
    editingId = id;

    for (const [property, fieldId] of Object.entries(FORM_FIELDS)) {
        writeField(fieldId, vendor[property]);
    }
    setFormMode("Edit vendor", "Save changes", true);
    document.getElementById("vendor-form").scrollIntoView({ behavior: "smooth" });   // scroll up to the form
}

// Clear the form and switch back to adding
function stopEditing() {
    editingId = null;
    document.getElementById("vendor-form").reset();
    setFormMode("Add a vendor", "Add vendor", false);
}

// Set the form's title, button text, and whether Cancel shows
function setFormMode(title, buttonText, showCancel) {
    document.getElementById("vendor-form-title").textContent = title;
    document.getElementById("vendor-submit").textContent = buttonText;
    document.getElementById("vendor-cancel").hidden = !showCancel;
}


// ===== Drawing =====

// "1234 Main St, Chattanooga, TN 37402", skipping blank parts
function formatAddress(d) {
    const parts = [];
    if (d.street) parts.push(d.street);
    if (d.city) parts.push(d.city);
    parts.push((d.state + " " + d.zip).trim());
    return parts.join(", ");
}

// Build one vendor's row: name, address, phones, Edit and Delete
function makeVendorItem(d) {
    const item = makeElement("li", "item");
    const info = makeElement("div");

    info.append(makeElement("strong", "", d.companyName));
    info.append(makeElement("span", "details", formatAddress(d)));

    // Office phone, if there is one
    if (d.companyPhone) {
        const phoneLine = makeElement("span", "details", "Office: ");
        phoneLine.append(makePhoneLink(d.companyPhone));
        info.append(phoneLine);
    }

    // Rep name and phone, if there are any
    if (d.repName || d.repPhone) {
        const repLine = makeElement("span", "details", "Rep: " + d.repName);
        if (d.repPhone) {
            repLine.append(" · ", makePhoneLink(d.repPhone));
        }
        info.append(repLine);
    }

    // When Edit is clicked, edit this one. When Delete is clicked, delete it.
    const buttons = makeElement("div", "buttons");
    buttons.append(
        makeButton("Edit", "secondary", function () { startEditing(d.id); }),
        makeButton("Delete", "danger", function () { deleteVendor(d.id); })
    );

    item.append(info, buttons);
    return item;
}

// Redraw the vendor list
export function renderVendors() {
    const list = resetList("vendor-list", "vendor-empty", db.vendors.length);
    for (const d of sortedVendors()) {
        list.append(makeVendorItem(d));
    }
}


// ===== Setup (runs once on page load) =====

export function initVendors() {
    // Fill the state dropdown
    const stateSelect = document.getElementById("d-state");
    stateSelect.append(new Option("--", ""));
    for (const code of US_STATES) {
        stateSelect.append(new Option(code, code));
    }

    // When the form is submitted, save the vendor
    document.getElementById("vendor-form").addEventListener("submit", function (event) {
        event.preventDefault();   // stop the page from reloading
        const fields = readForm();
        if (fields.companyName === "" || fields.state === "") {
            return;
        }
        saveVendor(fields);
    });

    // When Cancel is clicked, stop editing
    document.getElementById("vendor-cancel").addEventListener("click", stopEditing);
}
// ===== me.ts =====
// Who's signed in on this device, for the data layer: a new recipe is stamped
// with it (Recipe.createdBy), so a "Just recipes" place knows whose recipe it is.
// The session (cloud/session.ts) sets it on sign-in; "" = nobody (no account).

let currentUser = "";

export function setMe(userId: string) {
    currentUser = userId;
}

export function me(): string {
    return currentUser;
}

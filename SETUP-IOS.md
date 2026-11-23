# Putting Agave on the App Store

The iPhone app is the same Agave as the website, inside a native shell
([Capacitor](https://capacitorjs.com)). It's built on a Mac in GitHub's cloud, so you
don't need a new Mac. Apple only takes apps built with Xcode 26, which older Intel Macs can't run.

```
your code ──push──> GitHub ──"Run workflow"──> cloud Mac builds + signs ──> TestFlight ──> App Store
```

What's in the repo for this:

| File | What it does |
|---|---|
| `capacitor.config.ts` | The app's name and id (`com.getagaveapp.agave`, permanent once uploaded) |
| `ios/` | The iPhone project. Don't edit `ios/App/App/public`: it's copied from `dist` |
| `.github/workflows/ios.yml` | The cloud build that sends the app to TestFlight |
| `src/native.ts` | Haptics, status bar, notch, and where email links point |
| `src/pages/Account.tsx` + `supabase/functions/delete-account` | Deleting your account (Apple requires it) |
| `public/privacy.html` | The privacy policy, at sjmaniccia.github.io/bar-tool/privacy.html |

**Never paste the API key (.p8), its contents, or any Apple password into chat, email or the code.**
It only goes into GitHub's secrets.


## 1. Join the Apple Developer Program (you, ~20 minutes, then a day or two of waiting)

1. Make an Apple Account with **getagaveapp@gmail.com** at account.apple.com if you haven't.
   Turn on two-factor with your phone number.
2. Go to developer.apple.com/programs/enroll, sign in with it, enroll as an **Individual**, and pay.
3. Wait for the "Welcome to the Apple Developer Program" email.


## 2. Turn on account deleting (tonight, Terminal)

```
npx supabase functions deploy delete-account --remote=vqzfshvnawcmifkzbrey --use-api
```

Then push as usual. Try it with a throwaway account: profile > **Account** > **Delete my account**.


## 3. Register the app (after Apple approves you)

1. developer.apple.com/account > **Identifiers** > **+** > **App IDs** > **App**.
   Description `Agave`, Bundle ID **Explicit**: `com.getagaveapp.agave`. Continue, Register.
2. appstoreconnect.apple.com > **Apps** > **+** > **New App**:
   iOS, name `Agave: Recipes, Costs & Counts`, English (U.S.),
   bundle ID `com.getagaveapp.agave`, SKU `agave-ios`, Full Access.


## 4. Give GitHub a key to build with

1. App Store Connect > **Users and Access** > **Integrations** > **App Store Connect API** >
   **Team Keys** > **+**. Name `GitHub build`, Access **Admin** (needed so the build can make its
   own signing certificate). Generate.
2. **Download** the key. Apple only lets you download it once. Keep the file somewhere safe.
3. Note the **Key ID** (in the list) and the **Issuer ID** (above the list).
4. Your **Team ID**: developer.apple.com/account > **Membership details**.
5. GitHub > bar-tool > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**, four times:

| Name | Value |
|---|---|
| `APPLE_TEAM_ID` | Team ID |
| `ASC_KEY_ID` | Key ID |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8` | Open the downloaded `.p8` in TextEdit, copy **everything** including the BEGIN/END lines |


## 5. Build it

GitHub > **Actions** > **iPhone app to TestFlight** > **Run workflow**. It takes 10–20 minutes.
Then, 5–15 minutes later, the build shows in App Store Connect > your app > **TestFlight**.

To put it on your phone: install the **TestFlight** app, then in App Store Connect >
TestFlight > **Internal Testing** > **+**, make a group, add yourself.

Every change after that: push, then Run workflow again.


## 6. Send it for review

In App Store Connect > your app > the **1.0** version:

- **Screenshots**: iPhone 6.9" (1320 × 2868). Take them on your phone from the TestFlight build.
- **Subtitle**: `Scan & price recipes instantly`
- **Keywords** (hidden, 100 characters): inventory, pour cost, food cost, menu pricing, bar, kitchen, brewery...
- **Description, support URL** (`https://sjmaniccia.github.io/bar-tool/`).
- **Privacy policy URL**: `https://sjmaniccia.github.io/bar-tool/privacy.html`
- **App Privacy** questions: Agave collects **Contact info > Email address** and
  **User content > Photos** and **Other user content**, all for **App functionality**, linked to the
  person, **not** used for tracking.
- **Category**: Business. **Price**: Free. **Availability**: United States only, to start.
- **Sign-in information**: make a review account (e.g. `review@getagaveapp...` or a second
  Gmail), set up a place with **Sample recipes and data**, and give Apple that email and password.
- **Notes for the reviewer**: "Agave is a recipe costing and inventory tool for bars and
  restaurants. Sign in with the account above. Tap + to scan an invoice or recipe page."
- Pick the TestFlight build, then **Add for Review** > **Submit**.

Review usually takes a day or two. If they reject it, the message says why: send it to Claude.


## Not done yet

- **Links into the app**: invite links and email links open the website, not the app
  (FIXME in `src/native.ts`). Staff can join on the website, then sign in on the app.
- **Square** connects through Safari and comes back to the website; the app picks it up after.
- **Push notifications** ("invoice ready to approve").
- **Android** (Google Play): the same setup with `@capacitor/android`.

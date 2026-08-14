# Clancy Interactive Clinical Timeline

Interactive visualization built from the 100-source corpus, with an evidence cutoff of August 13, 2026 after Trial Day 13.

## View online

[Open the hosted interactive timeline](https://alexkdot.github.io/clancytimeline/).

## Open the finished local page

Open [Clancy_Interactive_Clinical_Timeline.html](standalone-dist/Clancy_Interactive_Clinical_Timeline.html) in a modern browser. It is a single self-contained file: no network connection or local server is required.

## Included interactions

- Clinical-course and post-offense views, with January 24 integrated into the main chronology
- An explicit timeline break compressing the clinically quiet interval between birth and late-August symptom onset
- Search and evidence-category filters
- Compact proportional chronology with automatic collision-managed card lanes
- Horizontal timeline zoom, one-click fit reset, and guided navigation
- Clickable event cards with details, evidentiary posture, certainty, source IDs, and interpretive cautions
- Separate cards for clinical encounters, patient communications, and important prescription/fill dates
- Thirteen medication lanes distinguishing prescribed/filled, reportedly taken, planned/uncertain, inpatient/recorded, and detected states
- Optional medication-context band above the main event timeline, with brand names, doses, and the same evidence-status styling
- Guided “Walk the story” mode
- Keyboard navigation and responsive layout

## Evidence boundary

This is an educational evidence visualization, not an independent diagnosis, malpractice opinion, criminal-responsibility opinion, or verdict recommendation. Prescription, fill, reported ingestion, documented administration, toxicologic detection, and causal effect remain separate propositions.

## Editable version

The application source is in `app/page.tsx` and `app/globals.css`. After editing, regenerate the standalone file with the `build:standalone` package script.

## Live Presenter Mode

Live Presenter Mode is an optional, state-based synchronization layer. The ordinary page remains a fully usable local timeline when Firebase is unconfigured, unavailable, or blocked by a network.

- Audience: `https://alexkdot.github.io/clancytimeline/`
- Presenter: `https://alexkdot.github.io/clancytimeline/?presenter=1`

Opening the presenter URL does not begin a broadcast. The presenter must sign in with Google, pass a rules-enforced authorization check, and deliberately select **Start presenting**. Audience clients read only the latest complete snapshot and never receive write access.

### Firebase Console setup

Only the Firebase browser configuration and one presenter identity are needed. Never create or share a service-account key, private key, database password, refresh token, or administrative credential.

1. **Create or select a Firebase project**
   - Open [Firebase Console](https://console.firebase.google.com/).
   - Select an existing project, or select **Add project** and complete the prompts. Google Analytics is optional for this feature.

2. **Register the web app and copy its browser configuration**
   - Open **Project settings → General → Your apps**.
   - Select the Web icon (`</>`), enter a nickname such as `Clancy timeline web`, and do not enable Firebase Hosting.
   - Select **Register app**.
   - Copy the complete `const firebaseConfig = { ... }` object shown under **SDK setup and configuration → Config**.

3. **Create Realtime Database in locked mode**
   - Open **Databases & Storage → Realtime Database → Create Database**.
   - Choose a suitable location and select **Locked mode**. Never select test mode.
   - If `databaseURL` was absent from the web configuration, copy the URL shown at the top of the database **Data** page.

4. **Enable Google Authentication**
   - Open **Security → Authentication → Sign-in method**.
   - Add **Google**, enable it, select the project support email, and save.

5. **Authorize GitHub Pages**
   - Open **Authentication → Settings → Authorized domains**.
   - Add exactly `alexkdot.github.io`.

6. **Use the authorized presenter identity**
   - `database.rules.json` authorizes only the verified Google account `akrawec1@gmail.com`.
   - Authorization is enforced by the database rules, not by the presenter URL or client interface.

7. **Install the locked rules**
   - Open **Realtime Database → Rules**, replace the editor contents with the complete updated rules file, and select **Publish**.
   - Confirm that the database remains out of test mode and root access remains denied.

### Build-time browser configuration

The committed `.env.production` contains the public Firebase web-app identifiers used by reproducible production builds, including the Realtime Database endpoint `https://clancy-timeline-default-rtdb.firebaseio.com`. No additional Firebase environment setup is required for this project’s production build.

For local development against a different Firebase project, copy `.env.example` to an untracked `.env.local` and fill in that project’s browser values:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID (optional)
```

These browser values identify a public web app; they are not authorization credentials. The verified email in `database.rules.json` is the write boundary.

`firebase.json` points Firebase tooling at `database.rules.json` and defines local Auth and Realtime Database emulator ports. `.firebaserc.example` can be copied to an untracked `.firebaserc` and updated with the project ID when Firebase CLI tooling is used. The public `.env.production` is intentionally committed; do not commit `.env.local`, emulator data, credentials, `node_modules`, or build caches.

### Security model

- Database root read and write are denied.
- Unauthenticated audience clients may read only `/presentations/main/meta` and `/presentations/main/state`.
- `/presentations/main/authChecks/$uid` is private and accepts only a short-lived probe from the exact verified presenter.
- Presentation state and metadata writes require that same identity.
- Rules validate the state schema, view, filter booleans, bounded text, stable selection shape, and normalized `0–1` scroll ratios.
- Client-side buttons, query parameters, Firebase browser keys, and email text in React are not authorization controls.

### Release verification

Run dependency installation from the lockfile, lint, all tests, the production build, and `npm run build:standalone`. The standalone command regenerates both deployment files and `docs/.nojekyll`. Before reporting production success, verify with two browser profiles or devices that explicit start/stop, unauthorized denial, late joining, view/filter/search/selection/scroll synchronization, Explore/Rejoin, stale-session unlocking, and offline fallback all behave correctly. Mock tests are not a substitute for that configured production check.

# Sleep Atlas for iOS

The iOS app packages the same application in `hosted/dist` using Capacitor. The shared platform adapter selects native photo picking and backup sharing inside iOS; the website retains its browser controls. There is no second calculation engine, catalog, OCR pipeline, or collection format.

`pnpm native:stage` copies the canonical web files into the ignored `native/www` directory, omits the hosting-only `_headers`, and injects the bundled `native-bridge.js` into that copy's HTML. It adds the Capacitor license and a SHA-256 inventory in `native-build.json`. Edit shared behavior in `hosted/dist`, native integration in `native/bridge-entry.js` and `native/ios`, and staging in `native/scripts/stage.mjs`. Do not edit generated `native/www` or `native/ios/App/App/public`.

## Development

Install Node.js 22 or newer, pnpm 11.19.0, full Xcode with the iOS SDK, and Python 3 for the existing calculator parity tests. Capacitor core, CLI and iOS are pinned together at 8.5.3 in the root package; esbuild bundles the native bridge and fake-indexeddb supplies isolated test databases. The lockfile pins the dependency graph. Swift Package Manager resolves the native Capacitor package during the Xcode build, which may require network access on its first run.

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test:web
pnpm ios:sync
pnpm test:native
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer pnpm ios:build
pnpm ios:open
```

`ios:sync` stages the shared app and runs Capacitor sync. `test:native` checks the platform adapter and verifies staged assets against the shared source and the inventory. `test:web` runs every existing `hosted/tests/*.mjs` suite in a separate Node process, including offline delivery, imports, storage, restore behavior, OCR parsing and calculation parity. These tests use only an in-memory IndexedDB implementation; they do not read a Safari or installed-app collection.

`ios:build` requires a current sync, verifies the copied iOS assets, and compiles an unsigned Release for `generic/platform=iOS`. It uses `DEVELOPER_DIR`, defaulting to `/Applications/Xcode.app/Contents/Developer`, without changing the machine's selected developer directory. Outputs and the full build log are under ignored `native/build`; the product is `native/build/Build/Products/Release-iphoneos/App.app`. No simulator runtime is needed for this compilation check. It does not install an app or prove runtime behavior on an iPhone.

For a device run or distribution, open `native/ios/App/App.xcodeproj` in Xcode, select the App target, choose your Apple development team in Signing & Capabilities, and confirm that `com.bingqchen.sleepatlas` is registered to that team. Use a suitable development or distribution signing configuration. The unsigned command intentionally does not choose a team, create provisioning profiles, or produce an installable App Store archive.

## Local data and offline use

The release loads packaged files at `capacitor://localhost`; there is no production `server.url`. Keep this scheme, hostname and bundle identifier stable between releases. The collection remains in `sleep-atlas-collection` IndexedDB, while drafts, import queues and device preferences remain in `sleep-atlas-mobile`. This app's WebView storage is separate from Safari and the Home Screen website. To bring an existing collection over, export its JSON backup there and restore that file in the iOS app.

Version 1 backup semantics remain unchanged: builds and settings are exported; screenshot images, recognized text and analysis history stay local. Backups do not include device-only island and teammate preferences. Removing the installed app can remove its collection, so retain exported backups independently. An ordinary app update should be tested without uninstalling to verify persistence under the unchanged origin.

The catalog, picture descriptors, Tesseract worker, embedded WASM cores and English language data ship in the app bundle. They do not require the website's offline-download flow. Native installation and updates come through the iOS distribution channel; the website keeps its separate Home Screen, service-worker and offline-download controls.

## Native integrations and privacy

The native system photo picker gives access to images explicitly selected by the user. It does not require broad Photos-library authorization. Selected images are made available locally for the existing screenshot reader and review flow; temporary native import files are released through the bridge. OCR continues to run on-device. Backup export presents the system share sheet so the user can save the JSON file to Files or choose another destination. Restore keeps the existing JSON file-selection and validation flow.

Do not add broad photo-library permissions or remote OCR merely to package this app. A user choosing a sharing destination controls that export; no automatic upload or cloud synchronization is provided by this integration.

## Verification and releases

Keep the two release channels explicit. Publishing `hosted/dist` updates the website and its service-worker release. Shipping a new iOS build requires restaging, syncing, native validation, signing and distributing that app through the selected Apple channel. Neither action publishes the other channel. Coordinate reader/cache versions when shared web dependencies change, and update the package version and Xcode marketing/build versions intentionally for native releases.

Before claiming an iOS release is ready, exercise it on an iPhone or an installed simulator runtime:

- Cold launch with networking unavailable, then calculate and read a screenshot using bundled OCR assets.
- Choose photos, cancel the picker, process multiple photos, review uncertain results, and resume an unfinished import after relaunch.
- Save and edit a helper, background the app during a draft, force-quit and reopen, then update the installed build without uninstalling and confirm collection retention.
- Export a backup to Files, cancel a share, restore a valid backup, and confirm invalid backups leave saved records intact.
- Check safe areas, the keyboard, long dialogs and source/help links on a phone-sized display.

Automated Node tests and an unsigned Xcode build do not establish these device behaviors. Record the device, iOS version, build and outcomes when performing runtime validation.

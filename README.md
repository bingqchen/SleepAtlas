# Sleep Atlas

A mobile-friendly, local Pokémon Sleep screenshot analyzer. Import English detail screens for one Pokémon, review extracted fields, and save daily production estimates and same-species ratings to SQLite.

## Run on this Mac

```sh
python3 server.py
```

Open **http://127.0.0.1:8765**. Alternatively, double-click `Start Sleep Atlas.command`.

Python 3.9+ is required. There are no Python or JavaScript packages to install. Screenshot text recognition uses Apple's Vision framework and a small Swift helper; Xcode Command Line Tools are required to compile it on first launch. The helper is cached in `.runtime/`. The first recognition request may take longer while macOS initializes its text recognition models. Manual entry and analysis also work on other operating systems.

## Install on an iPhone or iPad Home Screen

1. On this Mac, run `python3 server.py --phone`, or double-click **Start Sleep Atlas for Phone.command**. Stop an already running server on port 8765 first.
2. Open **http://127.0.0.1:8765** on the Mac and choose **Add to Home Screen** at the bottom. It shows the phone address and private access code.
3. Connect the iPhone/iPad to the same trusted Wi-Fi. Open the displayed address in **Safari** and enter the code when prompted.
4. In Safari, tap **Share → Add to Home Screen**. Enable **Open as Web App** if shown, then tap **Add**.
5. Open the new **Sleep Atlas** moon icon. Safari may use separate storage for the installed app, so you may need to enter the code again the first time.

The app uses its own window, icon, app name, safe-area layout, and standalone manifest. Safari controls the final installation; a website cannot install itself silently. See [Apple's Home Screen instructions](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios).

**Keep the Mac and server running.** Phone use still reads and writes the original SQLite database on the Mac. The app is not a native, phone-only calculator. Bonjour's `.local` address is preferred so changing Wi-Fi IP addresses do not break the installed icon; an IP-address fallback is also shown when available. Guest-network isolation or the Mac firewall can prevent the phone from reaching the server.

Phone mode binds to the local network, requires a pairing code for other devices, and remembers successful pairing in an HttpOnly, SameSite cookie for up to 90 days. The code lives in `data/mobile-access-code` with owner-only permissions and survives restarts. Delete that file with the server stopped to revoke all paired devices. The code is visible only in the loopback Mac UI. Do not put it in URLs or public messages.

Use phone mode only on a trusted local network; LAN HTTP is not encrypted. No public deployment, public tunnel, or certificate changes are made. The normal `python3 server.py` command still binds to this computer only.

**Home-screen use versus offline support:** Current iPhone/iPad Safari can open this local website as a home-screen web app. Service workers and offline launch require a trusted HTTPS address on the phone; they cannot operate over plain LAN HTTP. On localhost/HTTPS, the app shell is cached and the last loaded collection and unfinished review use IndexedDB. Analysis and saving always require the server. The project does not provision HTTPS or bypass certificate warnings. See [WebKit's home-screen support](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) and [PWA installability requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Import and review

- Select up to eight PNG, JPG, HEIC/HEIF, or WebP images, at most 12 MB each, for **one Pokémon**. Multiple screenshots are merged into one review.
- The reader recognizes English text and attempts species, level, nature, displayed carry limit, displayed main skill level, and labeled subskill positions.
- Ingredient icons are **not** automatically classified. Confirm the level 1, 30, and 60 ingredient slots manually. Missing fields remain unset. Nicknames may prevent species detection.
- Review all values, then choose **Analyze & save**. Use the displayed main skill level and carry limit, including bonuses; these must not be added twice.
- Saved records can be edited, searched, sorted, exported, restored, or deleted.
- Example analysis is not saved unless you explicitly save it.

The OCR integration was tested with a synthetic text fixture, not a user-provided Pokémon screenshot. Actual game layout/recognition quality needs validation with your screenshots. All extraction remains reviewable.

## What is stored

Database: `data/sleep-atlas.sqlite3` (WAL mode, schema version 1).

| Table | Contents |
| --- | --- |
| `pokemon` | Individual build, nickname, settings, timestamps |
| `analyses` | Versioned analysis result, catalog commit and model version |
| `daily_metrics` | Daily skill count, modeled total strength, ingredient count, and their ratings |
| `ingredient_metrics` | Count, base strength, and rating for every species ingredient, including zero-output options |
| `screenshots` | Original images, recognized text/positions, links to individuals |

Each edit appends an analysis version. Analyses include projections at levels 30 and 60 when applicable, plus all level-60 ingredient combinations. SQL statements are parameterized and related rows are written in transactions. Deletion cascades to that Pokémon's screenshots and analysis history.

**Export backup** creates portable JSON containing builds and screenshots. **Restore** validates the full input, adds missing IDs without overwriting existing individuals, and recalculates estimates. JSON backup does not preserve historical analysis versions; to back up the entire database, stop the server and copy `data/`. Never copy only the live `.sqlite3` file while WAL writes are active.

Set `SLEEP_ATLAS_DATA=/path/to/directory` before launch to choose a different storage directory. Keep data, runtime caches, and backups out of source control.

## Calculation model and limits

This is an original, deterministic comparison model, **not RaenonX or a complete game simulator**.

- Species data includes 247 Pokémon/forms, helping rates, berry values, ingredient slots/quantities, natures, subskills, and skill arrays from the pinned Neroli's Lab snapshot.
- Help interval uses species frequency, the level factor, nature, and active speed subskills, with a 35% speed-subskill cap.
- A constant average energy speed multiplier (default 2.2×) approximates energy over 24 hours. Sleep duration, awake collection interval, area bonus, favorite berry, and teammate Helping Bonus are editable per individual.
- Ingredients are sampled equally among unlocked selected slots. Expected inventory filling approximates when production becomes berry-only sneaky snacking. Skills use a capped binomial expectation per collection interval, with capacity one or two depending on specialty.
- **Raw strength** adds berry strength, gathered ingredients at base value, and supported direct skill strength. It excludes recipe/critical-meal multipliers, most support/special skill effects, and random ingredient skill strength. Ingredient Magnet counts are separate because the unlocked ingredient pool is player-specific.
- No precise energy simulation, pity skill triggers, good-night ribbons, camp tickets, event bonuses, recovery natures/skills, or team synergy. Daily output is an estimate with these limitations, not exact Snorlax strength.
- Forecasts keep the current displayed main skill level. Levels above 70 are explicitly hypothetical and do not assert the current in-game cap.
- Ratings are percentile ranks against **1,000 deterministic uniformly sampled builds**, with all 25 natures equally likely and five unique subskills chosen without rarity weighting. Comparisons hold species, level, ingredient spread, effective skill level and routine constant; inventory subskill differences are reflected. They are synthetic-model percentiles, not real-player population rankings or official game ratings.
- The same chosen spread is used when rating each ingredient. Other possible ingredients display zero until selected/unlocked; all level-60 alternatives are available separately.

## Source and attribution

Catalog derived from [Neroli's Lab](https://github.com/nerolis-lab/nerolis-lab), commit `ef1b1e6ce11ea809bef7b9a7249f574b1eb43561`, retrieved October 5, 2026. Source snapshot: `common/src/types/pokemon/__snapshots__/pokemon.test.ts.snap`; modifier definitions: `common/src/types/nature/nature.ts` and `common/src/types/subskill/subskills.ts`. Modified into JSON with executable fields and recursive skill implementations omitted. Frequency and berry formulas were checked against the upstream utilities. See `licenses/` for Apache 2.0 license and NOTICE.

Pokémon is owned by its respective rights holders. This is an unofficial fan project with no affiliation.

## Verification

```sh
PYTHONPYCACHEPREFIX=.runtime/pycache python3 -m unittest discover -s tests -v
```

Tests cover all species, level unlocks, strength scaling, banked skills, deterministic ratings, input validation, database reload/history, atomic restore, and cascade behavior. `tests/fixtures/ocr-text.png` is a clearly labeled synthetic OCR fixture.

## Project layout

- `web/`: responsive vanilla JavaScript UI, IndexedDB cache, manifest, service worker.
- `server.py`: local HTTP/JSON API, request validation, mobile access, OCR orchestration.
- `analysis_engine.py`: calculations, comparison samples, and OCR field parsing.
- `storage.py`: SQLite schema and transactional persistence.
- `scripts/ocr.swift`: macOS Vision text recognition.
- `catalog/pokemon.json`: pinned, offline species catalog.

The JSON API separates storage and computation from the UI, making a future native mobile shell or alternate OCR provider possible without redesigning the data model. A feature-detected WebMCP read tool exposes the currently loaded collection in supported browsers.

## Hosted edition

The `hosted/` directory contains the independent Sites edition: browser OCR, on-device IndexedDB storage, matching calculations, and an HTTPS home-screen web app. It does not need the Mac server running. The Mac SQLite collection is not uploaded automatically; use Export backup here and Restore in the hosted app to move it. Each browser/device has its own collection. See `hosted/README.md` for details.

Private hosted app: https://sleep-atlas-notebook.bchen399638.chatgpt.site

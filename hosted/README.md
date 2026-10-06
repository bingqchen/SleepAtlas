# Sleep Atlas · hosted edition

A private Sites-hosted web app. This directory is separate from the original Mac/Python app.

- Static HTML and ES modules; no build step, API key, cloud database, or Mac connection.
- Browser OCR: Tesseract.js 6.0.1, tesseract.js-core 6.0.0, English @tesseract.js-data/eng 1.0.0 (4.0.0_best_int), served from this site.
- IndexedDB sleep-atlas-collection stores Pokémon, versioned analyses, metrics, and screenshot blobs on each device. The original Mac SQLite database is not uploaded.
- JSON backup v1 is compatible with the Mac app. Restores validate first and commit atomically. Existing IDs are preserved. JSON exports contain Pokémon builds and settings; screenshot images, OCR, and analysis histories stay local and are excluded. Older backups containing screenshots can still be restored.
- The calculation model matches the original Python atlas-1.0 model. Catalog reference builds use the identical seed and sample sequence. The model is an estimate, not the game's complete simulator.
- Home-screen manifest, Apple touch icon, and service worker. Internet is needed for initial loading, OCR download, and potentially Sites sign-in. Offline data can be cleared by the browser; export backups regularly.

Run a local static server from dist to preview. No production data or credentials belong in this source tree. Deployment identity is in .openai/hosting.json; publishing uses the Sites workflow.

Validation: `node tests/check.mjs` compares 741 species/level cases and seven complete analyses to saved Python golden outputs. `node tests/storage.mjs /absolute/path/to/fake-indexeddb/auto/index.mjs` exercises IndexedDB behavior using the test-only fake-indexeddb 6.2.4 package. The app has no runtime npm dependency installation.

## Screenshot reader update

The reader combines color and contrast OCR passes, accepts combined species/level headers, locates carry values by nearby labels or the stats layout, and maps complete five-cell subskill grids. A geometrically complete grid with one unread cell preserves the other four assignments and triggers a focused OCR retry for the missing cell. Crops with uncertain grid positions remain unassigned. Ingredient icons still require manual review. Run `node tests/ocr.mjs` for the Mewtwo regression and ambiguous/partial layout checks.

Model atlas-1.1 uses subskill unlock levels 10, 25, 50, 70, 80. Source: Pokémon Sleep version 3.6.0 update (June 25, 2026), https://www.pokemonsleep.net/en/news/343133383535303430313835333033303436/ . Existing saved analyses retain their original model version until edited and recalculated.

## Reader v3

Adds on-device sprite comparison for nicknamed Pokémon, independent main-skill reading, focused OCR for missed subskill cells, and an explicit app-update control. The matcher compares 24×24 numerical descriptors for 491 normal/shiny variants covering all 247 catalog entries. It selects only a close match with a clear margin over the next species; ambiguous pictures stay editable. Non-English nickname text is not auto-filled.

Reference images come from `frontend/public/images/pokemon/` in the same pinned Neroli’s Lab commit as the catalog; Pokémon artwork belongs to its respective rights holders. The original PNGs and user screenshots are not in the hosted source. `scripts/build-sprite-features.py` rebuilds the descriptors from a local JSON sprite index and requires Pillow. `node tests/species.mjs` checks nickname handling, partial-grid behavior, descriptor coverage, and rejection of ambiguous or blank matches.

The second and third ingredient slots now use local icon matching. Quantity markers above the frequency row anchor crops, with a fallback anchored by the frequency/carry/skills panel when tiny quantity text is missed; the reader separates the icon from its pale background and compares normal and faded variants. Close, unambiguous matches are checked against the species' legal options and quantities. Conflicting, obscured, and uncertain matches remain unselected. The first slot uses the species' fixed catalog option and still requires review. References cover all 19 catalog ingredients plus the locked-slot placeholder from `frontend/public/images/ingredient/` in the same commit. Rebuild with `scripts/build-ingredient-features.py` (JSON index entries: name and path). Run `node tests/ingredients.mjs` for layout, matching, rejection, and slot validation checks.

## Reader v4

Pale Pokémon pictures now retain their gray outlines and shadows when constructing the descriptor. Species matching uses a relative confidence margin with an absolute floor, so predominantly white sprites are not rejected solely because all distances are small. Ingredient matching retains its separate thresholds. Selecting a species manually after an import reapplies any confident ingredient matches that are legal for that species. Gardevoir and its normal/faded Apple slots are covered by the picture regressions.

## Home-page collection summary

Reader v5 replaces the collection cards with a responsive table: name, level, total modeled raw strength per day, and the count for each Pokémon's specialty (skill triggers, gathered ingredients, or berries). All-rounders display all three counts. Clicking or tapping anywhere on a summary row opens its saved analysis; the name button also supports keyboard activation. Combined filters use specialty and a case-insensitive prefix of either nickname or species name. The top storage badge is removed; data storage and backup behavior are unchanged. Run `node tests/collection.mjs` for prefix, type, metric, and sorting checks.

## Save updates (Reader v6)

The review checkbox is removed. Required build fields still validate before saving. New entries deduplicate against the same species, nature, ordered ingredient lineup, and ordered subskills; subskills may stay the same or upgrade within their family (S → M, or Inventory Up S → M → L). Unknown slots match only identical unknown slots, never known skills. Level, nickname, notes, and routine settings do not identify a build. Carry/main-skill level must match or change by the exact bonus from a subskill upgrade/unlock. Different subskill families/positions and downgrades do not merge.

Matching happens within the IndexedDB write transaction. The new analysis replaces matching current records under a stable ID, combines previous analysis histories, and uses the newly imported screenshots. A manual entry without new screenshots retains the primary record's screenshots. Blank incoming nicknames/notes preserve existing metadata. Explicit edits keep their selected ID; backup restores retain their existing ID-based merge behavior. `node tests/dedupe.mjs /absolute/path/to/fake-indexeddb/auto/index.mjs` covers matching, atomic writes, concurrent saves, history, screenshot ownership, multiple duplicates, and backup consistency.

## Reader v7–v8

Word coordinates preserve each subskill's grid position when OCR joins both cards into one line. The portrait crop also uses the level word's position, so nicknames or picture fragments merged into the header cannot shift it. Small screenshots are enlarged for text recognition while original pixels are retained for picture comparison.

Portrait references include the original 491 normal/shiny entries and two compact, softened renderings per entry (48/80 pixels at 65% opacity on white), covering all 247 species. Confidence thresholds remain unchanged. Screenshot regressions cover Mewtwo, Sceptile, Gardevoir, Blastoise, and Blissey; ambiguous and solid-color regions stay unselected. Run `node tests/species.mjs` and `node tests/subskill-grid.mjs`. Rebuild descriptors with `scripts/build-sprite-features.py` using the pinned sprite index. Import screenshots of different Pokémon separately.

## Pokémon details (Reader v11)

Details show every subskill in its original unlock slot (10, 25, 50, 70, 80), including locked and unknown slots. Helping frequency uses the optional `build.displayedFrequencySeconds` from the Pokémon’s screenshot or manual entry; it does not alter modeled production. An unread value displays as Not recorded. Changing species, level, nature, or subskills in the editor clears the reading for reconfirmation.

Existing screenshot text can recover a missing frequency only when its level, nature, species (if read), and all subskills match the saved build. Explicit null suppresses recovery. Recovery also applies to image-free exports. Restores and the Mac app preserve the optional field; neither database schema nor backup format changes. Run `node tests/pokemon-stats.mjs /absolute/path/to/fake-indexeddb/auto/index.mjs` for OCR, stored stats, legacy recovery, and unchanged production checks.

## Hourly stats and locked ingredients (Reader v14)

Ingredient and carry-limit detection share the frequency parser's hour/minute/second abbreviations, including the game's `1 hr` format. Ingredient descriptors retain faded outlines, exclude the pale yellow backdrop, and sample only the isolated icon component. Reference descriptors use the same mask. Ambiguous icons can use the species' legal slot options only when the global best match is legal and the unchanged confidence checks pass against at least two legal candidates. No lower-ranked legal guess is substituted for an illegal best match.

`node tests/ingredients.mjs` covers Treecko/Dratini hourly stats, the previous Mewtwo/Sceptile/Gardevoir icons, blank and locked regions, species constraints, quantity mismatches, and conflicting screenshots. Fixtures contain OCR stats coordinates and compact ingredient descriptors, not full screenshots.

## Species edits (Reader v15)

Saved Pokémon can change species only within the evolution family linked in the catalog. The original saved species anchors the list, including when resuming a draft. Ancestors and branches are included; regional, size, and non-evolving event forms stay separate according to their explicit evolution links. New entries and unsaved examples retain the full species list. Ingredient selections are preserved when still legal for the selected evolution. The same family restriction is checked inside the save transaction before any record or screenshot changes.

Run `node tests/evolution.mjs /absolute/path/to/fake-indexeddb/auto/index.mjs` to check family boundaries, new entries, and rejected edits preserving saved data.

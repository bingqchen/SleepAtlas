# Sleep Atlas · hosted edition

A private Sites-hosted web app. This directory is separate from the original Mac/Python app.

- Static HTML and ES modules; no build step, API key, cloud database, or Mac connection.
- Browser OCR: Tesseract.js 6.0.1, tesseract.js-core 6.0.0, English @tesseract.js-data/eng 1.0.0 (4.0.0_best_int), served from this site.
- IndexedDB sleep-atlas-collection stores Pokémon, versioned analyses, metrics, and screenshot blobs on each device. The original Mac SQLite database is not uploaded.
- JSON backup v1 is compatible with the Mac app. Restores validate first and commit atomically. Existing IDs are preserved. JSON exports contain Pokémon builds and settings; screenshot images, OCR, and analysis histories stay local and are excluded. Older backups containing screenshots can still be restored.
- The default calculation model follows Python atlas-1.6, including automatic Berry Burst teammate estimates; the hosted app also supports selected teammates. Catalog reference builds use the identical seed and sample sequence. The model is an estimate, not the game's complete simulator.
- Home-screen manifest, Apple touch icon, and service worker. Internet is needed for initial loading, OCR download, and potentially Sites sign-in. Offline data can be cleared by the browser; export backups regularly.

Run a local static server from dist to preview. No production data or credentials belong in this source tree. Deployment identity is in .openai/hosting.json; publishing uses the Sites workflow.

Validation: `node tests/check.mjs` compares 741 species/level cases and 741 complete analyses under the historical solo baseline to saved Python golden outputs. `node tests/storage.mjs /absolute/path/to/fake-indexeddb/auto/index.mjs` exercises IndexedDB behavior using the test-only fake-indexeddb 6.2.4 package. The app has no runtime npm dependency installation.

## Screenshot reader update

The reader combines color and contrast OCR passes, accepts combined species/level headers, locates carry values by nearby labels or the stats layout, and maps complete five-cell subskill grids. A geometrically complete grid with one unread cell preserves the other four assignments and triggers a focused OCR retry for the missing cell. Crops with uncertain grid positions remain unassigned. Ingredient icons still require manual review. Run `node tests/ocr.mjs` for the Mewtwo regression and ambiguous/partial layout checks.

Model atlas-1.1 introduced subskill unlock levels 10, 25, 50, 70, 80. Source: Pokémon Sleep version 3.6.0 update (June 25, 2026), https://www.pokemonsleep.net/en/news/343133383535303430313835333033303436/ . Reader v18 refreshes older analyses for display using the current model while retaining their stored history.

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

## Unsaved changes (Reader v16)

The Pokémon editor uses its footer Cancel button instead of a header close icon. Cancel or Escape asks whether to keep editing or discard whenever fields have changed, a screenshot import is awaiting save, or a recovery draft was resumed. Unchanged forms close directly. Discard clears the active draft; closing an unchanged form preserves any unrelated recovery draft. Saving closes directly, and controls stay disabled while the save is in progress. A browser leave warning also protects unsaved edits where supported.

## Evolution stats (Reader v17)

Species changes update helping frequency and carry limit immediately. Frequency uses species base seconds, level, nature, and active Helping Speed S/M; the individual detail-screen estimate excludes Helping Bonus, energy, ribbon, camp, and temporary effects. Carry uses species base inventory + five per previous evolution + active Inventory Up S/M/L. Same-family changes preserve the difference between recorded carry and that calculated baseline, including additive ribbon bonuses. Repeated selections use an anchored baseline to prevent accumulating bonuses, and draft recovery retains that anchor even if an input was temporarily incomplete. New entries calculate missing values once enough details are available. Manual readings remain editable; explicitly cleared readings stay cleared until contributing stats change.

Calculated frequency is labeled and its source survives saving, export, and restore. Updating level or active speed/inventory subskills also updates the relevant stat; unrelated fields and routine assumptions do not overwrite a recorded reading. Unknown subskills contribute no bonus. Carry and frequency remain correctable when bonuses or effective nature differ from the recorded inputs.

Formula sources: the pinned [Neroli’s Lab catalog and calculator](https://github.com/nerolis-lab/nerolis-lab/tree/ef1b1e6ce11ea809bef7b9a7249f574b1eb43561), [RaenonX carry-limit research](https://hackmd.io/@raenonx-pokemon-sleep/rJa1j6QlZl), and the official [version 2.9.0 update](https://www.pokemonsleep.net/en/news/323735303337343331363231373436363839/) confirming the evolution inventory bonus also applies to befriended evolved Pokémon.

Run `node tests/calculated-stats.mjs /absolute/path/to/fake-indexeddb/auto/index.mjs` for all catalog species, evolution and subskill transitions, carry adjustments, partial inputs, and saved/backup frequency provenance.

## Own skill berries (Reader v18)

Model atlas-1.2 adds the Pokémon's own skill-generated berries to total berry count and strength. Each trigger uses the skill's own-berry amount at its current skill level; each berry uses the Pokémon's species and level plus the selected favorite-berry and area bonuses. Berry Finding S affects gathered berries only. Skill berries are included exactly once in total strength, with separate gathered/skill amounts in the detail breakdown.

Berry Burst, Disguise, Draco Meteor, and Lunar Blessing use their own-berry amounts from the pinned [Neroli's Lab skill implementations](https://github.com/nerolis-lab/nerolis-lab/tree/ef1b1e6ce11ea809bef7b9a7249f574b1eb43561/common/src/types/mainskill/mainskills). Draco Meteor assumes one Dragon species without Latias; Lunar Blessing assumes one Psychic species. Teammates' berries, additional team bonuses, energy support, and Disguise's sleep-reset Great Success bonus are excluded. Psystrike's Berry Zone and Berry Juice do not create berry counts in this model.

Pokémon with a supported berry-producing skill display total berries in the collection summary. Details show skill triggers, total strength, ingredients, and total berries, including four same-species percentile ratings. Existing saved and cached analyses refresh for display without rewriting builds, timestamps, screenshots, or analysis history. Exports remain image-free.

Run `node tests/berry-skills.mjs /absolute/path/to/fake-indexeddb/auto/index.mjs` for skill-level amounts, strength accounting, bonuses, summary counts, and non-destructive refresh of a real pre-v18 analysis. `node tests/check.mjs` checks the updated Python parity fixtures.

## Mew's selected skill (Reader v19)

Mew's editor can save its selected Versatile effect, using the [official learned-skill list](https://www.pokemonsleep.net/en/news/333832393735353631373931373030393934/). The optional `build.mainSkill` is restricted to Mew and supported choices. Old records remain unknown until selected. Skill level is retained on switching; modeled effects cap at the selected skill's maximum. Charge Strength S exposes fixed and random variants because the source does not specify which variant applies to Mew. Only the selected effect is borrowed; Mew keeps its own species traits. Supported strength, Ingredient Magnet output, and Berry Burst berries use the existing calculation rules. Candy, Metronome randomness, and indirect support effects remain excluded.

Mew's source catalog explicitly marks its 4% skill rate as a placeholder and its 20% ingredient rate as uncertain. Its estimates are labeled provisional. `build.mewSkillChance` is an optional assumed base percentage, editable in the routine settings and defaulting to 4%. Actual selected-skill rates are unverified. The [pinned species definition](https://github.com/nerolis-lab/nerolis-lab/blob/ef1b1e6ce11ea809bef7b9a7249f574b1eb43561/common/src/types/pokemon/all-pokemon.ts) and [level-cap helper](https://github.com/nerolis-lab/nerolis-lab/blob/ef1b1e6ce11ea809bef7b9a7249f574b1eb43561/common/src/types/mainskill/mainskill.ts) document these modeling assumptions.

Berry Burst adds Mew's own berries to total berries, strength, and the collection summary. Berry Juice is not a Mew learned skill and produces an energy-restoring item, not berries; see the [official item description](https://www.pokemonsleep.net/en/news/333532393337353930363032353936333533/).

Skill selection and rate assumptions survive edits, drafts, image-free backup exports, and restore. Different Mew skill choices do not automatically deduplicate; an explicit edit may switch the same saved Mew while retaining history. Same-species reference builds retain the selected effect and rate assumption. `node tests/mew-skills.mjs /absolute/path/to/fake-indexeddb/auto/index.mjs` covers all choices and levels, Python parity, preserved level 8 with capped effects, legacy defaults, invalid inputs, storage/history, and backup restoration.

## Swipe through details (Reader v20)

In saved Pokémon details, swipe left for the next Pokémon or right for the previous one. Previous/Next buttons and Left/Right arrow keys provide the same navigation. The sequence follows the collection's filters and sort at the time details opens, stops at either end, and shows the current position. Examples, single-item collections, and records outside the current filters do not offer paging. Each new Pokémon starts at the top of its details; Edit opens the displayed Pokémon.

## Delete from the editor (Reader v21)

Delete appears in the edit screen for saved Pokémon, beside Cancel and Analyze & save. It is hidden for new Pokémon and examples. Deletion asks for confirmation and warns when unsaved edits will also be discarded. Successful deletion clears a recovery draft for that Pokémon while preserving unrelated drafts; a failed deletion keeps the editor open. The details screen has no top-right × and retains its footer Close button and Escape support.

## Future levels through 80 (Reader v22)

Future levels now includes levels 30, 60, 70, and 80 when they are above the Pokémon's current level. Projections apply the relevant subskill and ingredient unlocks, including new Inventory Up capacity, while keeping the displayed main skill level unchanged. Level 80 is labeled as a hypothetical estimate. Model `atlas-1.3.1-web` refreshes existing saved analyses for display without rewriting their builds or history. Run `node tests/forecasts.mjs` for forecast boundaries, unlock effects, and old-analysis refresh coverage.

## Temporary collection levels (Reader v23)

The home screen's Temporary level selector previews every Pokémon at 25, 30, 50, 60, 70, or 80. Collection totals and sorting use that level; details also recalculate ratings, ingredient availability, subskill status, carry limit, and helping frequency. The displayed main skill level stays fixed. A notice identifies the preview and the saved level, and Edit always opens the actual saved build. Saved levels restores the original view, including any recorded frequency; reloading clears the override. Preview data is cached only in memory and never written to Pokémon records, drafts, history, or exports. Summary calculations are lightweight; reference ratings are calculated on demand for details or rating sorting. Run `node tests/level-preview.mjs /path/to/fake-indexeddb/auto/index.mjs` for preview and persistence coverage.

## Collection favorite berries (Reader v24)

Favorite berries in the top-bar overflow menu opens three optional berry selectors and a 2×/2.4× multiplier. Select up to three distinct berries from the 18 catalog berry types. Apply remembers this collection preference on the device, independently of Pokémon records and backups. Matching species receive the selected multiplier once on gathered and own skill-berry strength; other species receive ordinary berry strength. Berry counts, ingredient output, and direct skill strength are unchanged. The preference also applies to ratings, future projections, and temporary levels. Saved frequency/carry readings remain intact when only berries change. Use saved settings removes the global override and restores each Pokémon's individual favorite-berry setting; an applied empty selection explicitly makes all berries ordinary. Cancel leaves the previous selection unchanged.

Model `atlas-1.4-web` adds optional `settings.favoriteBerryMultiplier` (2 or 2.4), defaulting legacy favorites to 2×. Global preferences are applied only to derived views; Edit, drafts, histories, and exports retain actual builds. Run `node tests/favorite-berries.mjs /path/to/fake-indexeddb/auto/index.mjs` for multiplier, preview composition, validation, reload persistence, and saved-data preservation coverage.

Single-finger horizontal swipes leave vertical scrolling, overflowing tables, links/buttons, text selection, pinch zoom, and Safari's edge gestures alone. Closing, editing, or deleting invalidates pending detail reads so a late response cannot reopen the dialog. `node tests/detail-navigation.mjs` covers ordered neighbors, endpoints, gesture rejection, click suppression, and asynchronous close/error handling.


## Catalog updates (Reader v26)

The catalog is a bundled, pinned snapshot, not a live upstream subscription. **Check for updates** retrieves the latest published app/catalog; it does not fetch current game data independently. Reader v26 updates both catalogs to Neroli’s Lab commit `74e5068c1fa76518803caa8705798389da7f635d`, retrieved October 6, 2026. The upstream snapshot diff adds only Foongus and Amoonguss; all 247 prior species remain unchanged. Normal/shiny sprite references (including both compact render variants) now cover all 249 species. Existing ingredient references already cover their Mushroom/Egg/Tomato options. Rates are Neroli’s community data, not officially published probabilities.

To maintain the catalog, resolve and pin the current upstream commit, compare `common/src/types/pokemon/__snapshots__/pokemon.test.ts.snap` and the source definitions against the previous pin, and review additions/stat changes. Update `catalog/pokemon.json` and `dist/catalog.json` together, preserving the existing reference builds and supported skill fields. Never evaluate upstream snapshot code. Check evolution links and all ingredient options; import corresponding normal/shiny artwork descriptors with `scripts/build-sprite-features.py INDEX OUTPUT --source-commit COMMIT`. Fail coverage checks if catalog entries lack sprite references or ingredient icons. Record the source commit/date, bump the app cache version, run catalog, OCR, calculation and persistence regressions, then publish. There is currently no scheduled catalog updater.

`node tests/catalog-update.mjs` checks the Foongus screenshot’s recognized fields, portrait, locked ingredient icons, source stats, evolution options and catalog consistency. Existing saved records recalculate for display when the catalog commit changes; original builds and history are retained.


## Explicit offline download (Reader v28)

The collection overflow menu opens **Download for offline use**. The dialog checks all 32 current shell and OCR assets, downloads missing files with progress, reports actionable errors, and rechecks completion before displaying readiness. Downloads are about 16 MB, excluding Tesseract’s separately decompressed language data. Users should download inside the same browser or Home Screen app they will use offline. The install instructions now explain this step.

The service worker activates without downloading assets, so a slow or failed file cannot strand installation. The dialog waits for actual activation, repairs empty failed registrations on retry, and prevents update reloads while checking or downloading. The root page is downloaded once; `/index.html` uses the same cached page to avoid canonical URL redirects. Old caches are removed only after a complete new download. The service worker handles bounded status/download requests with MessageChannel and synchronous `event.waitUntil`, shares concurrent download work, and retains partial files for retry. `offline.js` bounds setup and response waits. Redirects, failed responses, and HTML at resource URLs are rejected. The app HTML must contain its collection and module markers. Storage errors do not turn successful online fetches into failures. Canonical path keys allow the cached root to serve offline launches with query strings. Real HTTP authentication failures remain visible instead of being replaced with a cached app page.

The two LSTM core variants, worker, and English language file use a separate pinned OCR cache, retained across app shell updates. Bump that cache name whenever the vendored resources change. Do not add the unused legacy cores to the download unless OCR configuration changes. Offline readiness checks cached files directly, so eviction is detected. No collection or screenshot records are modified by the download.

Run `node tests/offline.mjs` for real asset coverage, concurrent downloads, missing assets, quota/network/redirect/sign-in failures, retries, offline fetches, query-bearing launches, cache retention during updates, and UI response/version timeouts. Browser storage persistence remains best effort; download completion is not a cloud backup or a guarantee against storage eviction.

## Collection sorting (Reader v29)

Count-based sorts have been removed. Fastest speed sorts the visible build’s `displayedFrequencySeconds` ascending, with missing readings last; this matches details and temporary-level previews, excluding modeled team/energy assumptions. The last column shows own helping frequency for Speed, strength percentile out of 100 for Rating, and specialty counts for all other sorts. Highest strength remains the default.

## Compatible backup replacement (Reader v32)

Restore updates compatible existing IDs or unique same-species matches across IDs. Nature, ingredient slots, Mew skill choice, and ordered subskill families identify compatibility; imported mutable stats win. Same-ID evolution follows the editor’s evolution family. Matching is planned against one transaction snapshot, with exact IDs taking priority and competing/ambiguous updates skipped. Changes preserve local identity/history and image-free imports preserve screenshots. Unchanged builds and repeated legacy images are idempotent. Restore reports added, updated, unchanged, and skipped counts.


## Island favorite presets (Reader v33)

Favorite berries includes six fixed standard-island presets at 2×, plus manual Greengrass/Expert areas and Custom / event. Greengrass and Expert selections reset berries to none and multiplier to 2×; Custom preserves the draft. Optional `island` metadata stays with the local preference, preserving older preference objects without migration. Apply is transactional; Cancel never changes the applied override. Fixed presets validate their berry sets and multiplier. Expert weekly berry effects can be entered manually at 2.4×; other Expert bonuses remain outside the model.

Preset references: [Neroli’s pinned island data](https://github.com/nerolis-lab/nerolis-lab/tree/74e5068c1fa76518803caa8705798389da7f635d/common/src/types/island/islands), [research areas](https://www.serebii.net/pokemonsleep/researchareas.shtml), [official Amber Canyon announcement](https://www.pokemonsleep.net/en/news/333235333331303632383131303030383333/), and [official Expert Mode rules](https://www.pokemonsleep.net/en/news/323932383138363132393037393333363937/).


## Berry Burst teammate estimates (Reader v34)

Model `atlas-1.5-web` includes four estimated teammates for ordinary Berry Burst by default, including Mew’s selected effect. Each uses the caster’s berry value and favorite multiplier; skill level 6 now counts 30 own + 20 teammate berries per activation. Other berry-skill modifiers retain their existing solo calculations. Python `atlas-1.4` matches the automatic estimate.

Details → Choose teammates can instead select 0–4 distinct saved Pokémon. Each receiver uses its species, level, and favorite multiplier; caster area bonus applies once. Empty/deleted selections contribute zero, with missing selections reported. Derived counts, strength, ratings, forecasts, ingredient alternatives, collection sorting, temporary levels, and island favorites use the same context. Future-level forecasts keep selected receiver levels fixed; automatic receiver levels follow the caster. Own/team contributions are separate and included once in totals. Berry Finding S affects gathered berries only.

`berry-team.js` resolves IDs against current saved records. Preferences are stored transactionally in `sleep-atlas-mobile` cache key `berry-teams`; no entry means automatic and an empty array means selected zero teammates. Changes do not rewrite Pokémon builds, histories, or backups. Preview cache keys include resolved receiver species, levels, and multipliers, so edits, evolution, and missing records invalidate estimates. Reader v34 includes the module in the offline shell.

Run `node tests/berry-team.mjs /path/to/fake-indexeddb/auto/index.mjs` for 53 Python automatic-team parity cases, mixed receiver strength/area/favorite bonuses, ratings and forecasts, live reference and cache invalidation, persistence, and saved-data preservation. Historical golden checks explicitly use zero selected teammates; new expected outputs are independently checked against Python and berry-value formulas.


## Speed presets and editor choices (Reader v35)

Teammate options sort by derived total strength descending, independent of collection filters and home sort. Skill level is a required select populated from the resolved main skill’s `RP.length`; species/Mew-effect changes refresh it. Existing imports keep legacy levels compatible. The editor clamps an over-cap selection and explicitly states that saving applies the lower level.

Model `atlas-1.6-web` / Python `atlas-1.5` adds optional validated `settings.helpingFrequencyFactor` (0.5–1.5). Favorite preferences derive this from `favoriteSpeed` and `nonFavoriteSpeed` percentages: first favorite only receives the former, the other two receive zero, unmatched berries receive the latter. GGEX defaults to +10/−15 and Cyan EX +20/−35; legacy Expert preferences acquire these defaults. Custom preserves the current draft and allows ±50%; ordinary islands reset both to zero. A missing first slot cannot silently promote a subfavorite when a speed bonus applies.

Apply the factor to base frequency before final floor, after the stat-factor rounding, outside the Helping Speed cap. Preview settings update production, ratings, forecasts and calculated own frequency without altering stored builds or history. Main-skill +1 and other Expert effects remain excluded. Sources are the pinned Neroli event implementations linked in the user guide.

`node tests/island-speed.mjs` covers main/sub/nonfavorite effects, rounding boundaries, custom bounds, older preferences, Python parity, projected frequency and ratings, saved-stat preservation, every species/Mew skill cap, and strongest-first teammate choices. Existing favorites, preview, Berry Burst, Mew and offline suites remain applicable.


## Estimated RP (Reader v36)

Model `atlas-1.7-web` / Python `atlas-1.6` adds `current.rp` and forecast RP using an Apache-2.0 adaptation of the pinned Neroli RP formula (`dist/rp.js`, `rp_calculation.py`). RP is intrinsic and excludes all production-settings overrides, including island speed, favorites, routine, carry readings, and teammate effects. The formula uses corrected decimal floors, explicit 1–70 ingredient-growth data, active subskills, selected ingredient quantities, nature effects, and resolved skill RP weights. Unknown Mew skill and levels above 70 return null; selected Mew effects are provisional, ribbons/mints excluded.

Highest RP displays RP in the collection’s last column and sorts descending, unavailable last. Details show Estimated RP separately from daily metrics. Teammate choices now sort by RP with name/ID ties and include the value in labels. Model refresh adds RP to legacy display analyses without changing builds, history or image-free backups; offline includes the new module. Default Highest strength and existing percentile ratings remain unchanged.

`node tests/rp.mjs` checks ten independent screenshot/upstream values, staged rounding, 1,494 Python parity cases, setting invariance, temporary levels, unsupported values, and teammate ordering. `tests/berry-skills.mjs` checks legacy list/detail/cache RP refresh and untouched storage. RP sources and limitations are documented in the user guide.


## Island skill-level boost (Reader v37)

The overflow action and dialog are now **Select island**. Both Expert presets default to `mainSkillLevelBonus: 1`; ordinary presets reset it to zero, and Custom / event can select zero or one. Legacy Expert preferences acquire the default through validation. Only the first berry qualifies.

`favoriteSkillLevelBonus` derives the effect; `level-preview` passes it as context through current, reference, future-level, and ingredient-alternative calculations. `resolveMainSkill` accepts an explicit bonus and caps the resolved skill (including Mew selections). Its default remains zero for RP and editor options. `current.mainSkillLevel` reports the effective level and `current.mainSkillLevelBonus` reports the applied increase. Builds and saved levels remain unchanged. The hosted model is `atlas-1.8-web`; the original Python calculator has no island-selection context and remains `atlas-1.6`.

`tests/island-skill.mjs` verifies primary-only eligibility, caps for every species/Mew effect, RP independence, production/forecast/reference consistency, repeated previews, preference migration/reset, and UI draft controls. Existing favorite-berry persistence tests also cover reloads and unchanged backups/history.


## Favorite-type skill trigger option (Reader v38)

Select island offers a 1× / 1.25× skill-trigger selector for both Expert presets and Custom / event. The optional `skillTriggerMultiplier` preference defaults to 1 for existing data; normal island presets reset it. All three favorite types qualify, while nonfavorites stay at 1. Explicit event stacking with the berry-strength multiplier is allowed. The device preference persists separately from Pokémon records/backups.

`favoriteSkillTriggerMultiplier` derives the per-species context value. The hosted `atlas-1.9-web` engine multiplies nature/subskill/Mew-adjusted chance before the probability cap and banking expectation. Current, reference, forecast, ingredient-alternative, and temporary-level calculations share this context. The primary-only +1 skill level remains independent. RP ignores the context and saved stats stay unchanged; the original Python calculator remains `atlas-1.6` without these island controls.

`tests/island-trigger.mjs` covers all favorite positions, nonfavorites, default/reset/Custom behavior, Mew probability caps, banking, level bonuses, RP invariance, preview caching, and actual UI handlers. `tests/favorite-berries.mjs` checks trigger preference persistence/reload and untouched records/history/backups.

## Batch screenshot imports (Reader v39)

The default upload mode reads up to 20 photos independently with one reusable, on-device OCR worker. Complete fields with confident, consistent evidence and a verified portrait auto-save. Missing or conflicting readings enter a manual review queue with Save & next, Skip photo and Finish later. The optional second mode combines up to eight screens of one Pokémon. Completion clears collection filters and selects Recently added.

The separate IndexedDB import queue keeps source files and review edits across reloads. Queue writes are awaited and failures are shown. Stable screenshot IDs make rereading safe; per-entry save receipts make a retry after a committed Pokémon save idempotent, preserving history and avoiding duplicate saves. Pending-review screenshots are protected from orphan cleanup; skipping removes only unowned images. Existing deduplication and nickname preservation remain in force.

Auto-save requires all five subskills, all three ingredient slots, species, level, nature, main skill level, carry limit and recorded frequency. Scalar candidate sets detect conflicts within and between OCR passes. Optional nicknames/notes do not block saving; Mew still needs manual skill selection. The reported Mareep screenshot now uses its level prefix to anchor the portrait even when the digits are unreadable. A conservative contextual check combines the global best portrait with main skill, both ingredient icons and carry capacity; it accepts only a unique compatible species and leaves the unreadable level for review.

Validation: `node tests/import-review.mjs` covers complete and conflicting readings and the Mareep regression. `node tests/import-batch.mjs /absolute/path/to/fake-indexeddb/auto/index.mjs` covers isolation, partial failures, durable retry windows, save receipts, deduplication, history and picture ownership. Browser QA confirmed Mewtwo auto-save, Mareep review, Finish later/reload/resume, and return to Recently added. No full user screenshots are checked in.

## Separate photo confirmation (Reader v40)

All new uploads create one entry per photo; the grouping selector is removed. A saved v39 grouped review is repaired on Resume import before the pending/review branch is chosen. Fresh collection receipts reconcile any already-committed save first. Remaining groups split into pending child entries with new stable save tokens and corresponding picture IDs, then are read independently. Missing source files are recovered from local screenshot blobs when available. The replacement queue is persisted before processing; storage errors leave the original queue intact. Combined manual drafts remain in previousGroupedDrafts until the import completes and are never applied to unrelated children. Completed/skipped entries are preserved.

The editor shows only its current problem photo, at full content width on phones (up to 440px on desktop), before the field warnings. Tapping it opens a full-screen scrollable viewer with a 2× zoom toggle and Back to review. No new screenshot assets or network service are required.

Validation: import-batch covers legacy migration and idempotence; `node tests/import-migration.mjs` covers stored-blob recovery, interrupted-save receipts, awaited migration persistence and failures. Mobile browser QA confirmed two selected files produce Review photo 1 of 2 with one large image, Mewtwo auto-save, and working enlargement/zoom.

## Sunshine Picnic skin (Reader v41)

The collection, details, editor, menus, and supporting dialogs use the selected Sunshine Picnic theme: a yellow gingham masthead, cream paper, dark green type, pale green table headings, alternating cream rows, and yellow primary actions. The moon app icon, table density, interaction flow, and saved data are preserved. A decorative sun-and-leaves asset is bundled locally and included in the offline shell. Manifest and browser theme colors match the new surface.

Validation: mobile and desktop browser checks cover collection rows, menus, detail/edit screens, and narrow layouts. The offline suite verifies all real shell assets, including the new decoration, remain downloadable and available without a network.

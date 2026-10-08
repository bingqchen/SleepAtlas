# How Sleep Atlas works

Sleep Atlas turns Pokémon Sleep detail screenshots into a collection of Pokémon builds, estimates their daily output, and compares each build with other builds of the same species. Screenshot reading, calculations, and saving run on your device. The website supplies the app and a bundled Pokémon catalog; it does not synchronize your collection between devices.

This guide describes the hosted app as of **Reader v38, October 8, 2026**, using calculation model `atlas-1.9-web`. The original Mac app has a separate storage system and an older interface.

## From screenshot to collection

```mermaid
flowchart TD
    A[Pokémon detail screenshots] --> B[Read text and match pictures on device]
    C[Bundled species catalog and picture references] --> B
    B --> Q{Complete and confident?}
    Q -->|No| D[Review and correct the Pokémon build]
    Q -->|Yes| E
    D --> E[Calculate daily output and ratings]
    C --> E
    E --> F[Save build and analysis in local browser database]
    F --> G[Collection summary and Pokémon details]
    F --> H[Export builds as a JSON backup]
```

Open the top **⋮** menu and choose **Add Pokémon**. Select up to 20 screenshots; each photo is always read independently as one Pokémon. Complete, confidently recognized builds save automatically. Photos with missing or conflicting details appear in a review queue: correct the fields, then choose **Save & next**, **Skip photo**, or **Finish later**. The unfinished queue and edits are kept on this device and can resume after a reload. Once the batch finishes, the collection opens sorted by **Recently added**, with name and type filters cleared. Existing matching Pokémon are updated using the usual deduplication rules.

Confirmation shows only the current photo that needs review, at a larger width. Tap it to open the full-screen viewer, use **Zoom 2×** for small text, and choose **Back to review** to return without losing edits. You can also enter a Pokémon manually. Saving validates the fields; there is no separate confirmation checkbox. Automatic saves require a verified portrait, clear level, nature, main skill level, carry limit and frequency, all five subskills in their slots, and all three ingredient choices. A species-like nickname alone cannot trigger automatic saving. Empty optional nicknames and notes do not block it.

The saved build contains species, nickname, level, nature, five ordered subskills, three ingredient choices, main skill level, carry limit, helping frequency when available, notes, and analysis settings. Screenshots are evidence for those fields; daily production and ratings are calculated separately.

## Where Pokémon data comes from

The catalog comes from [Neroli’s Lab](https://github.com/nerolis-lab/nerolis-lab), with its source commit and retrieval date recorded. It supplies species base frequency, inventory, berry type and value, ingredient options and quantities, main skill effects, and ingredient and skill probabilities. The probabilities are community research values, not officially published game guarantees.

Reader v26 includes **249 Pokémon and forms**, pinned to commit [`74e5068c1fa76518803caa8705798389da7f635d`](https://github.com/nerolis-lab/nerolis-lab/tree/74e5068c1fa76518803caa8705798389da7f635d). The app also bundles reference pictures converted into compact numerical patterns for matching Pokémon portraits and ingredient icons.

### How updates reach your phone

Catalog updates are currently manual releases. A maintainer checks upstream changes, updates the catalog and matching references, tests them, and publishes a new app version. **Check for updates** loads the latest published Sleep Atlas version. It does not query live game data or independently pull new Pokémon from Neroli’s Lab. There is no scheduled catalog updater.

The catalog version also controls calculation freshness. When you load a saved collection with a newer catalog or model, the hosted app recalculates the displayed analysis. It keeps the saved build, timestamps, screenshots, and earlier analysis history intact. Saving an edit creates a new analysis history entry.

### Why Foongus was missing

The earlier catalog contained 247 species and forms and had no Foongus entry. Reading the word “Foongus” was insufficient because the app could not connect it to supported species data or a reference portrait. Reader v26 added both Foongus and Amoonguss, including their normal and shiny picture references.

Your screenshot now matches this build:

| Field | Value |
| --- | --- |
| Species and level | Foongus, level 14 |
| Nature | Hasty |
| Carry limit | 12 |
| Helping frequency | 1 hr 32 min 31 sec |
| Ingredient slots at levels 1, 30, 60 | Tasty Mushroom ×2, ×5, ×7 |
| Subskills at levels 10, 25, 50, 70, 80 | Skill Trigger S; Inventory Up S; Ingredient Finder S; Energy Recovery Bonus; Ingredient Finder M |

Foongus’s catalog base frequency is 5,700 seconds. With level 14, Hasty’s neutral helping-speed effect, and no active speed subskill, the calculation is `floor(5700 × (1 − 0.002 × 13)) = 5551` seconds, matching the screenshot. The locked mushroom slots are saved now but contribute to production only when their unlock levels are reached.

## How screenshot recognition works

The hosted app uses **Tesseract.js**, an English text reader running in the browser. It does not send the screenshots to ChatGPT or another cloud vision service.

1. **Read the text.** The app enlarges small screenshots and reads both the original colors and a high-contrast version. Text positions help distinguish the Pokémon’s level from ingredient or subskill unlock labels.
2. **Identify the species.** It looks for a catalog species name and separately compares the portrait against normal and shiny references. A custom nickname can therefore still be recognized by its picture. If text and picture disagree, the app asks for a manual species choice.
3. **Place the subskills.** It uses labels, word positions, and the two-column grid to assign slots at levels 10, 25, 50, 70, and 80. A mostly readable grid can trigger another text-reading pass over the missing cell. Recognizing a skill name without locating its slot is not enough to fill an arbitrary dropdown.
4. **Identify ingredients.** The second and third ingredient icons are compared with normal and faded references. Matches must be sufficiently clear and valid for that species, slot, and quantity when readable. The first ingredient uses the species’ fixed catalog option.
5. **Keep uncertain values editable.** Missing, conflicting, or ambiguous results are left for review. Non-English nickname text is not automatically filled, even when the species is identified from its portrait.

If recognition fails, first check the app version and species list. For a supported species, use a clearer detail screenshot with the header, frequency, ingredient icons, and subskill grid visible. Selecting the species manually can resolve ingredient matches that require species context. Photos are never combined into a single reading. Resume an unfinished import from Reader v39 to separate any previously grouped photos and read them again independently. Already completed saves are preserved. Any edits made to the old combined review are retained in the temporary queue for recovery, but are not copied onto separate Pokémon.

An unreadable level number can still locate the portrait when its “Lv.” prefix is visible. For a close but ambiguous portrait, the reader can confirm the global best match when a clearly read main skill, both later ingredient icons, and carry capacity leave exactly one catalog species. It never substitutes a lower-ranked portrait candidate. The reported Mareep photo uses this check; its unreadable level still requires manual entry.

## How daily estimates are calculated

All production figures are expected totals over **24 hours**, so fractional counts are normal. The app models average behavior rather than replaying every in-game help.

### Helping frequency and carry limit

The frequency shown in Pokémon details can be the value read from the screenshot or entered manually. It is retained as the Pokémon’s own displayed stat. **That recorded value does not override the production model**, which calculates frequency from catalog data and the selected settings.

For the Pokémon’s own calculated stat, the app applies species base frequency, a level factor of `1 − 0.002 × (level − 1)`, the nature’s speed effect, and active Helping Speed S/M subskills. The production model additionally includes Helping Bonus and teammate Helping Bonus, with the combined subskill speed reduction capped at 35%. It then applies an assumed average energy multiplier to the number of helps per hour.

Calculated carry limit starts with species base inventory, adds five per previous evolution, and adds active Inventory Up bonuses. When you change evolution or level, the editor preserves the difference between the recorded carry limit and this baseline, so an existing additive bonus is not lost or repeatedly added. Recorded and calculated values remain editable.

### Ingredients and skills

Only unlocked ingredient slots contribute: the first slot from level 1, the second from level 30, and the third from level 60. The model treats unlocked selected slots as equally likely on an ingredient help. Base ingredient probability is adjusted by nature and active Ingredient Finder subskills.

Inventory capacity limits normal production between collections. The default routine assumes 8.5 hours of sleep and collection every three waking hours. Once modeled inventory is full, excess helps become berry-only sneaky snacking; they do not add modeled ingredients or skill triggers.

Skill probability uses the species rate, nature, and active Skill Trigger subskills. The estimate accounts for storing at most one activation between collections, or two for skill specialists and all-rounders. The displayed main skill level is used without adding a Skill Level Up bonus again. The editor’s skill-level dropdown offers only valid levels for the selected skill. Switching Mew’s effect to one with a lower cap reduces the selection; saving applies that level. Legacy backups can retain a higher stored level, with calculations capped at the selected effect’s maximum. The editor explains any adjustment before saving.

### Berries and total strength

Berry specialists and all-rounders start with two berries per berry help; other specialties start with one. Active Berry Finding S adds one. Berry value grows with level using the larger of the catalog’s linear and exponential growth formulas.

For supported berry-producing skills, total berries also include expected activations multiplied by the Pokémon’s own berries per activation. Berry Burst, Disguise, Draco Meteor, and Lunar Blessing use this treatment. Ordinary Berry Burst also includes teammate berries, as described below; other team-dependent skills retain solo assumptions. The collection shows berry count for these builds instead of skill count. Details still show both metrics.

```text
Total berries = gathered berries + modeled own berries from skills
              + modeled Berry Burst teammate berries

Total raw strength = berry strength
                   + gathered ingredients at their base values
                   + supported direct skill strength
```

Favorite berry multipliers affect berry strength, including modeled skill berries, but do not increase berry counts. The area bonus scales modeled strength. The screenshot’s RP number is not used as daily strength; daily strength is calculated from expected production. Ingredient Magnet’s extra ingredients are shown separately because their types and strength depend on the player’s unlocked ingredient pool.

Mew’s selected main skill is saved in its build. Supported selected effects use the same calculation rules, while Mew retains its own species data. Its rates are provisional; the base skill chance defaults to a 4% assumption and is editable. **Berry Juice is not currently a selectable Mew effect or a modeled berry source.**

### Berry Burst teammates

Ordinary **Berry Burst**, including Mew’s selected effect, assumes four teammates with the skill user’s berry type, level, and favorite bonus by default. At skill level 6 it produces **30 own + 20 teammate berries per activation**. This estimates a full team; it does not claim to know your actual teammates.

Open the Pokémon’s details and choose **Choose teammates → Selected Pokémon** to select up to four saved teammates. Choices are ordered by estimated RP, highest first, including temporary levels; unavailable RP appears last and ties use name/ID. Each choice displays its RP. Island and teammate assumptions do not change RP; home-page filters do not restrict the choices. Each contributes the skill’s teammate berry amount using its own species, level, and favorite bonus. Empty slots and deleted or unavailable teammates contribute zero, with unavailable selections identified in details. You can select distinct Pokémon of the same species. Return to Automatic estimate to restore the four-similar-teammates assumption.

```text
Teammate strength / day = expected activations × berries per teammate
                       × sum(selected teammates’ berry values × favorite bonuses)
                       × (1 + skill user’s area bonus / 100)
```

These are berries created by this Pokémon’s skill; teammates’ ordinary production is not added. Berry Finding S does not increase skill berries. Details separate own and teammate contributions, and total berries and total strength include each once. The same team assumptions apply to every reference build used for ratings.

Temporary collection levels and island favorites also apply to the selected teammates. Future-level forecasts hold selected teammates at their current preview levels while advancing the skill user; automatic teammates follow the skill user’s projected level. Editing or evolving a selected teammate updates the estimate. Teammate choices are remembered for each Pokémon on this device, independently of saved builds and analysis history, and are excluded from JSON backups. The original Mac/Python calculator uses the automatic estimate; the teammate selector is in the hosted app.

The berry quantities and receiver-specific values follow the pinned [Neroli’s Lab Berry Burst implementation](https://github.com/nerolis-lab/nerolis-lab/blob/74e5068c1fa76518803caa8705798389da7f635d/backend/src/services/simulation-service/team-simulator/skill-state/skill-effects/berry-burst/berry-burst-effect.ts). Disguise, Draco Meteor, Lunar Blessing, and Berry Juice are unchanged.

### Island helping speed

Select island also shows two speed adjustments. **Greengrass Expert** uses **+10%** for the first (main) favorite and **−15%** for non-favorites; the two other favorites keep normal speed. Cyan Expert uses +20% and −35%. These percentages shorten or lengthen the help interval: +10% means an interval factor of 0.90, and −15% means 1.15. They are applied separately from the 35% subskill speed cap, to base frequency before the final rounding down.

Choose **Custom / event** to edit either percentage from −50% through +50%. Custom retains the selected island’s current values. Ordinary island presets reset both to zero. The first berry slot must identify the main favorite when a main-favorite bonus applies; the app will not silently treat a second-slot berry as the main favorite.

The factors affect daily production, total strength, ratings, forecasts, and speed sorting. With an active adjustment, the frequency shown in details is recalculated from species, level, nature, and Helping Speed subskills and labeled with the interval factor. It excludes ribbon and Helping Bonus effects; the production model separately includes Helping Bonus. Saved readings, builds, and backups are unchanged. Disabling the override restores the original reading.

Speed percentages follow the pinned [Greengrass Expert implementation](https://github.com/nerolis-lab/nerolis-lab/blob/74e5068c1fa76518803caa8705798389da7f635d/common/src/events/events/2025-08-11-greengrass-expert-mode.ts) and [Cyan Expert implementation](https://github.com/nerolis-lab/nerolis-lab/blob/74e5068c1fa76518803caa8705798389da7f635d/common/src/events/events/2026-08-06-cyan-expert-mode.ts). Both Expert presets also apply +1 main skill level to helpers matching the first favorite berry, capped at the selected skill’s maximum. Custom / event can enable or disable it. This is a temporary analysis-context effect: details display the effective skill level, but the editor, saved build, history, backups, and intrinsic RP keep the original level. The same bonus applies to reference builds, ingredient alternatives, and forecasts; it never stacks again when reopening a preview.

### Rotating Expert bonuses

The weekly pool contains three effects for Pokémon matching any of the three favorite berries: main-skill trigger chance ×1.25, favorite-berry strength ×2.4 instead of ×2, or extra ingredients per ingredient-producing help. The ingredient bonus is +1, with ingredient and All specialists having a 50% chance of another +1 (mean +1.5). It does not increase ingredient-finding probability. Sleep Atlas models the berry option through its multiplier and the skill option through **Select island → Favorite-type skill trigger rate → 1.25×**. This choice is available for both Expert islands and Custom / event. It defaults to 1×, applies to all three favorites, and is remembered on this device. Selecting a new island resets it to 1×; switching to Custom retains the draft. Set the bonuses active in the game; the two controls can combine for event stacking. The ingredient bonus is not modeled. Cyan Expert also has a fixed +5 carry bonus for the main favorite, which is not added automatically here.

The multiplier changes chance per help after nature and subskills, before the probability cap and skill-banking calculations. Daily triggers may rise by less than 25%. It applies to summaries, details, forecasts, ingredient alternatives, and reference builds; RP and saved Pokémon stats remain unchanged. It also applies to Mew’s assumed rate for the selected skill. Carry capacity and gathered ingredient output are unchanged.

The [official Expert Mode announcement](https://www.pokemonsleep.net/en/news/323932383138363132393037393333363937/) confirms one weekly bonus and stacking with events. Exact numerical weekly effects follow the [Neroli island selector](https://github.com/nerolis-lab/nerolis-lab/blob/74e5068c1fa76518803caa8705798389da7f635d/frontend/src/components/map/island-select.vue); the extra ingredient-specialist roll follows its [simulation implementation](https://github.com/nerolis-lab/nerolis-lab/blob/47f1ff33f4637ceb2bd357b7d778c8df0a94200a/backend/src/services/simulation-service/team-simulator/member-state/member-state.ts).

### What the estimates leave out

Raw strength excludes recipe multipliers, critical meals, most support effects, teammate berries from skills other than ordinary Berry Burst, Berry Zone strength boosts, and random ingredient skill strength. The model does not simulate energy recovery throughout the day, skill pity, full team synergy, camp tickets, other event bonuses, or ribbon effects automatically. A recorded carry value can still include an actual bonus.

These estimates support consistent comparisons under shared assumptions. They are not exact forecasts of Snorlax’s final strength.

## Estimated RP (Research Power)

**Highest RP** sorts the collection by RP descending and displays RP in its last column. Details show Estimated RP beside the Pokémon’s own stats. Berry Burst teammate choices also sort by RP and display it. RP is independent of daily strength and the app’s percentile ratings. The default collection sort remains Highest strength.

The calculation adapts the pinned [Neroli’s Lab RP formula](https://github.com/nerolis-lab/nerolis-lab/blob/74e5068c1fa76518803caa8705798389da7f635d/common/src/utils/rp-utils/rp.ts):

```text
RP = round(miscellaneous factor × (berry component + ingredient component + skill component))
```

The three components use five hours of help output with energy excluded. Own Helping Speed S/M and nature affect frequency; unlocked ingredient slots and Ingredient Finder affect ingredients; the main skill’s catalog RP weight and Skill Trigger affect skills. RP uses its own staged decimal floors, so it does not reuse the rounded helping frequency or daily production results. Helping Bonus and other support subskills add fixed RP weights; Inventory Up adds a weight rather than using actual carry capacity. The energy-recovery nature factor is 0.92, 1, or 1.08. Displayed main skill level already includes Skill Level Up, so it is not added twice.

Favorite berries, island speeds, area bonus, sleep/collection routine, teammate selections, carry-size corrections and recorded frequency do not alter RP. Temporary levels through 70 recalculate unlocks and RP without changing the saved build. Existing analyses acquire RP automatically when opened without rewriting their history or backup data.

**Limits:** Good-Night Ribbon and neutralizing mint effects are not recorded and are excluded. Mew’s selected skill uses the selected effect’s RP weight with provisional species rates and the app’s skill-chance assumption; its RP is provisional. An unknown Mew skill shows no estimate. Ingredient growth is verified in the catalog only through level 70, so RP is unavailable above 70. The upstream polynomial fallback drops below the level-70 value and is intentionally not used. Unavailable entries sort last. These limitations can cause differences from in-game RP.

Regression checks match five provided screenshots: Gardevoir52 = 4,591, Sceptile67 = 5,664, Treecko13 = 605, Dratini14 = 615, Foongus14 = 342. Five independent upstream fixtures and 1,494 Python/JavaScript cross-checks cover additional species, levels, and rounding.

## What a rating means

Each metric is compared with **1,000 deterministic sample builds of the same species and level**. The comparison keeps ingredient choices, main skill selection and level, routine, Berry Burst teammate assumptions, and the build’s underlying carry allowance fixed. It varies nature and five unique subskills, applying only those unlocked at the chosen level and adjusting inventory bonuses.

The samples use all 25 natures uniformly and do not weight subskills by in-game rarity. A rating near 90 means the result is around the 90th percentile of these synthetic builds; ties share a midpoint rank. It is not a comparison with other species, the user’s collection, or the real player population.

Skill triggers, strength, ingredient count, total berries, and individual ingredients have separate ratings. The highest strength rating need not imply the best support Pokémon because many support effects are excluded.

## Collection controls and previews

The collection defaults to **Highest strength**. The name filter matches the beginning of either nickname or species name. The **Pokémon type** filter means specialty—Berry, Ingredient, Skill, or All-rounder—rather than elemental type.

Sorting defaults to highest strength. Choose Fastest speed to sort by the Pokémon’s own helping frequency, shortest interval first, and display that frequency in the last column. Missing readings appear last as “Not recorded.” Highest rating displays the strength percentile out of 100 in the last column. Other sorts keep the usual specialty counts. Temporary levels apply to these values too.

Tap a row to see its details, including the nature name with up/down effect badges (or Neutral), and helping frequency in minute/second notation such as 30′53″. The detail screen omits the original screenshot text section. Swipe left or right through the current filtered and sorted collection. Edit opens the saved build; species choices are restricted to that Pokémon’s evolution family. New entries can select any supported species. Delete is inside Edit, and leaving unsaved edits asks for confirmation.

| Control | Effect | Persistence |
| --- | --- | --- |
| Temporary level | Recalculates collection and details at 25, 30, 50, 60, 70, or 80, including relevant unlocks, carry, and frequency | Clears on reload; does not change saved builds |
| Select island in the overflow menu | Selects an island preset or up to three manual berry types with a 2× or 2.4× strength multiplier | Remembered on this device; not included in Pokémon backups |
| Use saved settings for favorites | Removes the collection override and uses each Pokémon’s individual setting | Remembers removal of the override |
| Future levels in details | Projects levels 30, 60, 70, and 80 above the current displayed level | Derived estimates; main skill level stays fixed |

The Select island dialog includes an island selector. Cyan Beach, Taupe Hollow, Snowdrop Tundra, Lapis Lakeside, Old Gold Power Plant, and Amber Canyon fill their fixed three berries and 2× multiplier. Selecting Greengrass Isle clears all three berries, resets the multiplier to 2×, and enables manual choices for the week. Expert areas also require manual weekly choices: their 2.4× berry effect is not guaranteed. Custom / event unlocks the current choices for changes. Apply remembers the island and preferences on this device; Cancel leaves the applied settings alone. The primary favorite’s capped +1 main skill level is applied. The optional 1.25× favorite-type trigger bonus is applied; rotating ingredient bonuses and Cyan’s extra carry capacity are not simulated.

An applied empty favorite selection gives every berry ordinary strength. Temporary level and favorite berry overrides affect collection totals and sorting; editing or exporting still uses the actual saved builds. The Future levels table does not change the collection sort. Levels above 70 are labeled hypothetical projections, not a claim about the current game cap.

## Saving duplicates and making backups

When adding a new entry, the app checks for the same species, nature, ordered ingredient choices, selected Mew skill, and ordered subskills. Subskills may match or upgrade within the same family, such as Skill Trigger S to M. Unknown slots must match exactly. Level, nickname, notes, and routine settings do not identify the Pokémon.

Carry limit and main skill level must match or change by the corresponding active subskill bonus. A qualifying import replaces the current matching record while preserving its analysis history. Explicit edits keep their selected record ID. This is a stats-based match, not a game-issued Pokémon identity, so two distinct Pokémon with matching builds can be merged.

The hosted app stores Pokémon, analyses, history, and screenshot blobs in **IndexedDB**, the browser’s local database. A separate local store holds the draft, cache, and favorite berry preference. Hosting the app does not upload this collection. Different browsers, devices, and Home Screen storage contexts can have separate collections.

**Export backup** creates JSON containing Pokémon IDs, builds, notes, and individual settings. It leaves out screenshots, recognized text, analysis history, and collection-wide favorite berry preferences. **Restore** validates the complete backup and recalculates analyses before writing. Compatible imports overwrite existing Pokémon, keeping the local ID, creation date, and previous analyses. Nature, ordered ingredients, selected Mew skill, and ordered subskills must match; S/M/L variants within a subskill family are compatible in either direction. Exact IDs take priority and can follow the same evolution family; different IDs require a unique same-species match. Imported levels, main skill levels, carry limits, frequency, notes, nicknames, and settings win. Conflicts, ambiguous matches, and competing imports are skipped and counted. Identical imports leave history and timestamps unchanged. Image-free imports preserve local screenshots. All accepted changes are written in one transaction. Older backups containing screenshots remain supported.

Use Export and Restore to move a collection between devices. Export regularly: browser data can be cleared or evicted. The Home Screen installation and private website sign-in do not provide cloud backup. Use the offline download option below to prepare this browser or Home Screen app before disconnecting. Sign-in may still require a connection.

## Downloading for offline use

While connected, open **⋮ → Download for offline use**, then choose **Download for offline use** in the dialog. The full download is about 16 MB. Keep the app open until it shows **Ready for offline use**. The download includes the app, catalog, portrait and ingredient references, English recognition data, the OCR worker, and both supported LSTM engine variants.

The dialog checks that all required files are present in the current caches. Setup waits for the offline worker to activate before downloading. Failed setup can be retried without clearing the collection. It reports progress, keeps successfully downloaded files after an interruption, and retries missing files. A failed download, a full device, or a sign-in response cannot produce a successful readiness result. Reopen this menu to check the files again, especially before travelling.

On an iPhone or iPad, use **Add to Home Screen**, launch Sleep Atlas from its icon, and download inside that app. A download in a Safari tab may not be available in the Home Screen app’s separate storage. Once ready, the same app can open its collection, calculate, save, and read screenshots offline. Updates and sign-in may require internet. The browser can clear downloaded files; this download does not replace an exported collection backup.

App updates replace the smaller app cache. The larger OCR files use a separately versioned cache and survive updates when their versions have not changed. The readiness check always examines actual cached files rather than trusting a saved success flag.

## Maintaining the catalog and implementation

For each catalog release, compare the pinned upstream snapshot and source definitions with the proposed new commit. Review changed statistics and uncertainties, update both catalogs, and add picture references for new species or ingredients. Preserve the deterministic reference builds unless intentionally changing the rating model.

Before publication, check species and ingredient coverage, evolution links, screenshot regressions, calculations, and saved-data behavior. Record the source commit and retrieval date, bump the Reader and service-worker cache versions, and publish the static hosted app. Catalog and model versions in analysis results identify the assumptions used. A GitHub commit alone does not update the installed app; the new site version must also be published.

| Responsibility | Main implementation |
| --- | --- |
| Interface, edit flow, dialogs | [app.js](../hosted/dist/app.js) |
| Text recognition and slot parsing | [ocr.js](../hosted/dist/ocr.js), [ocr-parser.js](../hosted/dist/ocr-parser.js) |
| Portrait and ingredient matching | [sprite-matcher.js](../hosted/dist/sprite-matcher.js), [ingredient-matcher.js](../hosted/dist/ingredient-matcher.js) |
| Daily output and ratings | [engine.js](../hosted/dist/engine.js) |
| Own frequency and carry calculations | [pokemon-stats.js](../hosted/dist/pokemon-stats.js) |
| Local storage, restore, and analysis refresh | [local-api.js](../hosted/dist/local-api.js) |
| Duplicate matching | [build-identity.js](../hosted/dist/build-identity.js) |
| Temporary levels and favorites | [level-preview.js](../hosted/dist/level-preview.js), [favorite-berries.js](../hosted/dist/favorite-berries.js) |
| Hosted and Mac catalogs | [hosted catalog](../hosted/dist/catalog.json), [Mac catalog](../catalog/pokemon.json) |
| Offline downloads and cache | [offline.js](../hosted/dist/offline.js), [sw.js](../hosted/dist/sw.js) |

The `/api/...` paths in the hosted JavaScript are handled by the local API function; they are not requests to a cloud Pokémon database. The original Mac edition instead uses [server.py](../server.py), [analysis_engine.py](../analysis_engine.py), Apple Vision OCR, and SQLite. See the [project README](../README.md) for Mac setup and the [hosted README](../hosted/README.md) for implementation history and test commands.

The [Foongus regression test](../hosted/tests/catalog-update.mjs) covers the reported screenshot’s fields, portrait, faded mushroom icons, catalog stats, and evolution. Other suites cover legacy screenshot cases, calculations, deduplication, storage, and non-destructive previews. Source data is distributed with the project’s Apache 2.0 attribution; Pokémon artwork and names belong to their respective rights holders.

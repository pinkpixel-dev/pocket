# Changelog

All notable changes to Pocket are recorded here. This project follows [semantic versioning](https://semver.org/).

## 2.2.0 - September 7, 2026

### 📁 Collections

- Bulk move to collection is now available when selecting bookmarks. You can pick multiple bookmark cards or rows and file them into an existing collection, unfile them to No collection, or create a brand new collection directly from the move dialog

### 🤖 AI

- "Sort with AI" is now available in selection mode on the bookmarks page. Select unsorted bookmarks to organize them or pick already collected links to re-sort them, launching the interactive review dialog directly from the main view
- AI collection planning now files all uncollected bookmarks in chunks instead of capping at 250 links. Libraries with hundreds or thousands of unfiled links now process through their entire backlog in a single sorting pass

### 🎨 Cards

- Shift the action dropdown menu up on bookmark cards so all actions, including Delete, fit cleanly within card bounds without clipping

### 🎨 Settings

- Clarified the collections table order dropdown label to "Order by:" and added visual separation from the "Tidy up with AI" button to avoid confusing table ordering with AI sorting

### 🐛 Fixes

- Uncollected bookmarks triage counts accurately reflect the total uncollected bookmarks across the library instead of summing only the top 20 domains
- Uncollected bookmarks triage now refreshes immediately when bookmarks are filed, collections are deleted, or categories are applied, removing filed domains from the list without requiring a page reload
- Domain bookmark IDs are now gathered reliably without truncation risk on domains with large bookmark counts

## 2.1.1 - September 7, 2026

### 🐛 Fixes

- Working links are no longer marked "broken link". The check used to treat every answer above HTTP 400 as a dead link, so a bot filter, a login wall, a rate limit or a server having a bad afternoon all got the same badge as a page that had genuinely gone. Sites behind Cloudflare, dev.to among them, were the usual casualties
- Only a 404 or a 410, or a host that cannot be reached at all, counts as broken now. When a host refuses the Pocket user agent, the check asks once more as a browser before deciding anything
- A timeout no longer condemns a link. Running out of patience says something about the network between your NAS and the site, not about the bookmark
- Previews no longer spin forever. A fetch that stalled before a socket came up had nothing to stop it, because the timeouts in play only started counting once a connection existed. Three stalled fetches filled every slot in the queue and everything behind them sat there pending
- One enrichment job now has a single budget covering the page and every preview and favicon it tries, rather than a fresh timeout for each of up to thirteen requests. A slow host could previously hold a queue slot for minutes on its own

### 🔧 Configuration

- `POCKET_ENRICH_TIMEOUT_MS` sets how long one enrichment job may take, defaulting to 45 seconds
- `POCKET_PROBE_USER_AGENT` sets the browser string the link check retries with

## 2.1.0 - September 7, 2026

### 🐛 Fixes

- Importing a bookmarks file with the link check turned on no longer comes back empty. The check used to run before anything was saved, so a large file spent minutes probing URLs while the browser waited, and when that request timed out not one bookmark had been written. Turning the option off was the only way to import at all
- The check now runs after the import, against the links that import just added, so the file is saved in seconds no matter how big it is

### 📥 Import

- "Skip dead links" is now "Check links after importing". Everything in the file is saved first, then the links are read in the background and the broken ones are marked, so you review them instead of losing them silently
- The background check reports its progress in the Link health section of Settings, with the same progress bar and cancel button the manual scan uses
- Broken links land in "Needs attention", where selection mode can clear them out in bulk
- When "Fetch titles and previews after importing" is already on, no second check is started. That pass reads every page anyway and marks the ones that fail
- The import summary counts links being checked instead of links skipped

### 🧹 Maintenance

- `startLibraryAudit` takes an optional list of bookmark ids, so a scan can cover one import rather than the whole library
- `services/import-link-check.test.ts` covers the import returning before any link is read, the scan being scoped to what the import wrote, and no duplicate scan when the metadata pass is running

## 2.0.0 - September 7, 2026

### 🔐 Accounts

- Pocket has its own sign-in. The first person to open it picks a username and password, and that account owns whatever the library already held
- Each account gets its own bookmarks, collections, tags and AI settings. Nobody can see anyone else's library, including the owner
- Two people can save the same URL, and can each have a collection with the same name, without colliding
- The owner adds and removes accounts from Settings, under "Your account". There is no open sign-up
- The owner can reset a password for someone who forgot theirs, which signs that person's other devices out
- Changing your own password signs out every other session
- Removing an account deletes its bookmarks, collections and tags with it. The owner account cannot be deleted, and nobody can delete the account they are signed in with
- Sessions are a 30-day `HttpOnly`, `SameSite=Lax` cookie. Behind a proxy that sets `X-Forwarded-Proto`, the `Secure` flag follows it, or `POCKET_SECURE_COOKIES` forces it either way
- Passwords are hashed with scrypt from Node's own crypto, so no new native dependency. Session tokens are stored as SHA-256 hashes, so a database backup cannot be replayed as a live session
- A wrong password and an unknown username take the same time to answer. Ten failed sign-ins from one address in fifteen minutes gets that address a 429

### 🤖 AI

- The OpenAI key, model, effort and toggles are per account, so nobody spends on anyone else's key
- `POCKET_OPENAI_API_KEY` is now a shared fallback rather than a lock. Every account can use it without pasting anything, and an account that saves its own key uses that instead. Removing your own key falls back to the shared one
- Settings says which of the two a request is going to be billed to

### 🗄️ Database

- Migration 4 adds `users` and `sessions`, and adds `user_id` to `bookmarks`, `collections`, `tags` and `settings`
- Because SQLite cannot add a column to an existing `UNIQUE` constraint, those four tables are rebuilt by copy, drop and rename. Ids are preserved, so `bookmark_tags` is untouched. `foreign_key_check` runs before the migration finishes and refuses to leave a broken database behind
- Everything that existed before this release is assigned to the owner account and reappears once setup is finished

### 🧹 Maintenance

- The link health scan is tracked per account, so one person's scan no longer overwrites the progress another person is watching, and neither can cancel the other's run
- The metadata and AI job queue carries the owner of each job, and reports its pending count per account. The concurrency limit stays shared, since it is the NAS's uplink being protected
- `services/isolation.test.ts` covers the separation with two real accounts: listings, search, reads, writes, deletes, bulk operations, cross-account ids, and account deletion

### ⚠️ Upgrading

- Take a backup before updating. The migration rebuilds four tables and cannot be reversed
- On first start, Pocket asks you to create an account. Do this before telling anyone else the address, because whoever finishes setup inherits the existing library
- Every API route except `/api/health` now requires a session, and so does `/media`. Anything scripted against the API needs to sign in at `POST /api/auth/login` and send the cookie back

## 1.0.0 - September 7, 2026

### 🚀 Release

- First stable release of Pocket: a private, self-hosted bookmark library designed for home servers and personal NAS storage
- Single container deployment with zero external database dependencies, storing library data and cached media locally

### 🗂️ Collections

- AI sorting plans before it files. It reads everything in "No collection", proposes a short list of broad collections (roughly one per twelve links), and then files bookmarks into that closed list. A name outside the plan is dropped instead of created, so a run can no longer end with a collection per bookmark
- The planned collections are shown as chips before sorting starts, and any of them can be dropped
- Sorting runs through the whole uncollected list in batches of 40 with visible progress
- "Tidy up with AI" above the collection list reviews every collection with its size and sample titles, then proposes merges and tag conversions for review. "AI music" and "AI prompting" become "AI", "Creative licensing" and "Open source licensing" become "Licensing"
- Merging can keep each old collection name as a tag, on by default in the tidy-up plan and offered as a checkbox in the manual merge dialog
- "Move to collection" can create a collection on the spot. Pick "Create new collection...", type a name, and the bookmark moves into it without closing the dialog first. A name that matches an existing collection reuses it instead of failing on the duplicate
- The move dialog no longer sends you to the sidebar when the library has no collections yet
- The single-bookmark AI pass no longer prefers inventing a collection when it is torn. It reuses the existing broader one and can never create a narrower version of a collection you already have

### 🏷️ Tags

- The AI sees the tags your library already uses, busiest first, whenever it files a bookmark. It is told to reuse them and never to invent a synonym or a plural of a tag that already exists. The batch filing pass was not being shown the tag list at all, which is where most of the duplication came from
- "Tidy up with AI" above the tag list folds synonyms, plurals and rephrasings into the tag that is already used most, and flags tags that group nothing. Merges start ticked, deletions do not
- The tag tidy-up prompt prefers folding a one-off tag into a broader tag that is already in use over deleting it, covers narrow-to-broad merges like "arch linux" into "linux", and groups sources into fewer, larger actions rather than returning a handful of pairs
- Tags can be selected in bulk and merged into one name, or deleted together
- Merging into a name the library does not have yet creates it. A bookmark that already carried the target tag does not end up with it twice
- The single-bookmark AI pass sees 80 tags, ordered by use rather than arbitrarily

### 🧹 Bulk actions

- Selection mode in every bookmark view: tap the checkbox button in the toolbar, then tap cards or rows to pick them
- Select all bookmarks matching the current view, including pages that have not been scrolled into yet, so a full "Needs attention" list can be cleared in one go
- Delete every selected bookmark at once with a confirmation step that names the count
- Press Escape or "Done" to leave selection mode

### 🧭 Sidebar and settings

- The sidebar can be resized. Drag its right edge, or focus it and use the arrow keys, Home and End. Double click or press Enter to go back to the default width
- The width is remembered in this browser, between 200px and 460px, and only applies on wide screens where the sidebar is a column rather than a drawer
- Collection and tag names that are too long to fit show in full on hover
- The collections "Sort:" control sits on its own line beneath the "Tidy up with AI" button, so the panel header reads as a single right-aligned stack
- An always-visible select-all checkbox sits above both the collections and tags lists, with an indeterminate state for partial selections, so the bulk actions are discoverable without selecting an item first

### 🤖 AI naming

- Collection names the AI proposes are capped at one or two words and 18 characters, and it cannot join two ideas with "and", "&" or "/". "UI Component libraries & templates" becomes "UI", with the rest carried as tags
- The rule applies to all three paths: filing a single bookmark, planning a sorting run, and naming a merge target during a tidy-up

### 📥 Import

- Smart hierarchy import reads a browser export's folder tree and turns it into a sensible collection layout instead of one collection per folder
- Remove the "Innermost folder" folder organization option, which was the setting most likely to produce hundreds of one-link collections. Imports that send it fall back to Smart hierarchy

### 🎨 Appearance

- Accent color palette in Settings Appearance: Gold (default), Blue, Red, Green, Cyan, Purple, Pink, and Teal

### 🛠️ API

- Add `POST /api/bookmarks/bulk-delete`, which takes up to 1000 ids per request and reports how many rows were removed
- Add `POST /api/ai/plan-collections` and `POST /api/ai/suggest-collection-cleanup`
- Add `POST /api/tags/merge`, `POST /api/tags/bulk-delete` and `POST /api/ai/suggest-tag-cleanup`
- `POST /api/ai/suggest-categories` accepts a `collections` list, which is the closed set of names filing may use
- `POST /api/collections/merge` accepts `tagWithSourceNames`
- AI failures answer with 502 and the message OpenAI returned, instead of a generic 500

### 🐛 Fixes

- The bookmark list requested a single unpaged page from `/api/bookmarks`, so views capped out at the server's default 200 rows even in an 11k-bookmark library. It now fetches 100 at a time and appends the next page as you reach the bottom, with a "Load more" button as a fallback. Background refreshes merge over the loaded list rather than replacing it, so polling no longer resets scroll
- Applying a tidy-up plan with nothing ticked did nothing and said nothing. On a tag list that is mostly single-use tags the AI proposes mostly deletions, and deletions start unticked, so Apply sat disabled and pressing it looked like a broken button. Apply now stays pressable whenever the plan has actions and tells you when nothing is ticked
- Both tidy-up dialogs report the real outcome by counting the list again after applying, so a plan that changed nothing says so instead of claiming success
- Added a "Tick everything" control to the tag plan, and a line saying how many tags the ticked actions actually remove
- Cached previews, favicons and covers shared by several deleted bookmarks are released correctly in one pass

### 🐳 Docker

- Official multi-architecture image (`linux/amd64` and `linux/arm64`) published on Docker Hub as `pinkpixeldev/pocket:1.0.0` and `pinkpixeldev/pocket:latest`
- Add Docker publishing guide and Docker Hub overview documentation in `/DOCS`

### 📖 Documentation

- Expand README with Docker Hub pull commands, standalone mobile installation instructions, and accent color customization

## 0.6.0 - September 7, 2026

### 🎨 Appearance

- Add accent color selection in Settings Appearance with eight options: Gold (default), Blue, Red, Green, Cyan, Purple, Pink, and Teal
- Synchronize the Pocket logo color to match the chosen accent using tuned CSS hue and saturation filters
- Persist accent preference in local storage with immediate pre-mount initialization to eliminate theme flashing

## 0.5.0 - September 7, 2026

### 🎨 Branding

- Replace the generic bookmark icon in the top-left sidebar header with the Pocket logo
- Use dedicated `favicon.png` for browser tabs and bookmarks

### 📱 PWA

- Configure `icon.png` as the dedicated app icon for home screens and app switchers
- Add web app manifest with standalone display mode and dark theme tokens matching the interface
- Add mobile web app meta tags for iOS home screen launch

## 0.4.0 - September 7, 2026

### 🖼️ Custom covers

- Put your own image on any bookmark. Upload a file, drop one onto the dialog, or paste a link to an image and Pocket downloads it for you
- Covers live in the edit dialog, and "Add a cover" or "Change cover" in a card's menu opens the dialog with the controls already in view
- A cover wins over whatever preview was fetched, and removing it brings the fetched preview back. "Refresh preview" leaves your cover alone
- Covers save the moment you choose one, so you do not have to press Save changes afterwards
- The "no preview" flag on a card disappears once you have given it a cover, since the complaint no longer applies
- Uploaded bytes are identified by their magic numbers, the same as fetched images, and a pasted link goes through the same address guard as every other outbound request
- New `POCKET_MAX_COVER_BYTES` setting, 10 MB by default

### 🐛 Fixes

- Covers no longer vanish after a page refresh. Previews were held at zero opacity until React saw a `load` event, and a cached image can finish before that handler is attached, which left a fully loaded image invisible until you toggled views. The fade is plain CSS now

### 🗄️ Database

- Migration 3 adds a `cover_path` column to `bookmarks`. It is additive and applies on first start

## 0.3.0 - September 7, 2026

### ✨ Filling in links with AI

- Optional OpenAI connection that fills in whatever a page did not give you: the title, a description, a few tags, and the collection the link belongs in
- It runs after the normal preview fetch, not instead of it, so the model only ever sees a bookmark that already has whatever the page could supply. It writes into empty fields only and never touches something you typed
- Paste an API key in Settings and it is stored in your database, or set `POCKET_OPENAI_API_KEY` and the browser cannot change it
- Twelve models to pick from, with prices shown. The default is `gpt-5.4-nano`
- Thinking effort is selectable per model, and an effort a model does not support falls back instead of failing
- "Fill in with AI" on any card or list row, for links you saved before you set a key. The item is greyed out when there is nothing left to fill
- Two toggles: whether new links are filled in automatically, and whether it may create collections it does not already have
- It reuses one of your collections when a link genuinely belongs there, and makes a new one when nothing fits. The prompt carries your collection names plus a couple of the titles already filed under each, since a name on its own is thin evidence for judging a fit
- When it is torn between an existing collection and a new one, it makes the new one. A collection full of loosely related things is worth less than one more collection
- Imported bookmarks are skipped on purpose. A browser export can be thousands of links and each one would be a paid request
- Cards show a "filling in" marker while a job runs and an "AI failed" marker with the reason when one does not
- With no key set anywhere, none of this appears. No menu item, no card marker, no requests

### 📁 Collections

- "+ Create new collection" in the collection dropdown when adding or editing a link, so naming one no longer means closing the dialog first. It is created when you save, and a name that already exists is reused rather than duplicated
- Rename, recolour, and delete a collection from its row in the sidebar, next to where you actually click it. The same controls remain in Settings
- Deleting the collection you are currently looking at returns you to All bookmarks instead of leaving you in an empty view

### 🔒 Security

- The OpenAI request goes through the same address guard as every other outbound fetch, on its own connection pool with a longer timeout since a reasoning model takes a while to answer
- `store: false` is sent on every request, so OpenAI keeps no copy of the conversation

### 🗄️ Database

- Migration 2 adds a `settings` table and three `ai_*` columns to `bookmarks`. It is additive and applies on first start

## 0.2.0 - September 7, 2026

### 🖼️ Card sizes

- Grid view now has small, medium, and large cards, chosen from a new Appearance section in Settings
- Medium is the default. Large is the card size Pocket shipped with in 0.1.0
- Smaller cards fit more columns and trim detail instead of squashing it: medium clamps the description to one line, small drops the description and tag row and keeps the title, site, and date
- The loading placeholders match whichever size is active, so the layout does not jump
- The choice is saved per browser under `pocket:card-size`

## 0.1.0 - September 7, 2026

First release. Pocket is usable as a bookmark manager.

### 🔖 Saving and organizing

- Save a bookmark from a URL, with duplicate detection against a normalized form of the link
- Automatic metadata fetching in the background: title, description, site name, favicon, and preview image
- Manual entry and editing for pages whose metadata cannot be fetched
- Collections, one per bookmark, with a colour and an optional description
- Tags, as many per bookmark as you want, with rename and merge
- Pinned bookmarks, which sort to the top of every view
- Search across titles, URLs, descriptions, site names, and tags
- Sorting by newest, oldest, title, site, or last changed

### 🖼️ Previews

- Open Graph, Twitter card, and inline article images are tried in order and cached locally
- Favicons cached alongside previews, with apple-touch-icon preferred
- Cached files are content-addressed, so bookmarks sharing an image share one file
- A designed fallback for links with no image, using the favicon or the site's initials on a colour keyed to the domain
- Manual metadata refresh per bookmark

### 📥 Import and export

- Import browser bookmark HTML from any browser. Folders become collections and existing links are skipped
- Import a Pocket JSON backup
- Export browser-compatible HTML
- Export JSON that also carries collections and tags

### 🖥️ Interface

- Grid and list views, with the choice remembered per browser
- Responsive down to 320px, with a sidebar that becomes a drawer on narrow screens
- Keyboard shortcuts: `/` focuses search, `n` opens the save dialog
- Dialogs built on the native `dialog` element, so focus trapping and Escape work correctly

### 🔒 Security

- Metadata fetches are blocked from reaching loopback, private, link-local, carrier-grade NAT, and reserved addresses
- The address check runs at connect time, which closes the DNS rebinding window, and literal IP hosts are checked separately
- Redirects are followed one hop at a time and re-checked at each hop
- Response size limits on both HTML and images, with downloaded images identified by their bytes rather than the declared content type
- Cached images are served with a restrictive Content-Security-Policy and `nosniff`

### 📦 Deployment

- Single Docker image on Alpine, serving the API and the frontend from one Node process
- Compose file with a bind-mounted data directory and a health check
- Graceful shutdown with a SQLite WAL checkpoint
- Metadata jobs still pending at shutdown are resumed on the next start

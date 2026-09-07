# Changelog

All notable changes to Pocket are recorded here. This project follows [semantic versioning](https://semver.org/).

## 1.0.0 - September 7, 2026

### 🚀 Release

- First stable release of Pocket: a private, self-hosted bookmark library designed for home servers and personal NAS storage
- Single container deployment with zero external database dependencies, storing library data and cached media locally

### 🎨 Appearance

- Reorder accent color palette in Settings Appearance: Gold (default), Blue, Red, Green, Cyan, Purple, Pink, and Teal

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

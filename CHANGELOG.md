# Changelog

All notable changes to Pocket are recorded here. This project follows [semantic versioning](https://semver.org/).

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

# Pocket

Pocket is a self-hosted bookmark manager for a NAS or home server. You paste a link, it fetches the title, description, favicon, and preview image in the background, and you get a card you can find again later.

It stores everything in a single SQLite file with cached images beside it, so a normal file backup captures your whole library. Nothing leaves your machine except the requests Pocket makes to fetch page metadata.

I built it because browser bookmark bars stop being useful somewhere around 200 links, and most of the alternatives are either a hosted service or a full read-it-later platform. This one just saves links, organizes them, and finds them again.

![Pocket grid view](DOCS/images/grid-view.png)

Grid view above. There is also a [compact list view](DOCS/images/list-view.png) for scanning, and the whole thing [works on a phone](DOCS/images/mobile.png).

## What it does

- Save a link with one paste. Pocket fetches the page details after saving, so a slow or unreachable site never blocks you.
- Cards with real page previews, pulled from Open Graph or Twitter card images and cached locally.
- A designed fallback for links with no preview image, using the favicon, the site's initials, and a colour keyed to the domain.
- Collections (one per bookmark) and tags (as many as you want).
- Search across titles, URLs, descriptions, site names, and tags.
- Pinned bookmarks, which float to the top of every view.
- Grid view for browsing and list view for scanning or tidying up.
- Three card sizes, set in Settings. Small fits the most links on screen, large gives you the biggest previews.
- Import from any browser's bookmark HTML export. Folders become collections, and links you already have are skipped.
- Export as browser-compatible HTML, or as JSON that also keeps your collections and tags.

## What it does not do

No accounts, no AI tagging, no cloud sync, no page archiving, no screenshot rendering. Pocket has no login of its own, so it belongs on a trusted network or behind a reverse proxy that handles authentication. See [Access and security](#access-and-security).

## Running it on a NAS

You need Docker with Compose. Grab the repo, then:

```bash
mkdir -p data
docker compose up -d
```

Pocket is at `http://<your-nas>:8420`.

The `data` directory holds `pocket.db` and the cached `previews/` and `favicons/` folders. It is bind-mounted into the container, so rebuilding or updating the image does not touch your bookmarks.

The container runs as the bundled `node` user (uid 1000). If your NAS share is owned by a different account, uncomment the `user:` line in `compose.yml` and set the ids to match, then make sure `data` is writable by them.

Full deployment notes, including backup, restore, and updating, are in [DOCS/DEPLOYMENT.md](DOCS/DEPLOYMENT.md).

## Running it locally

Node 22 or newer.

```bash
npm install
npm run dev
```

That starts the API on port 8420 and the Vite dev server on port 5273, which proxies `/api` and `/media` through to the API. Open `http://localhost:5273`.

To run the production build the way the container does:

```bash
npm run build
npm start
```

The database and cached images land in `./data` unless you set `POCKET_DATA_DIR`.

## Configuration

Every setting is an environment variable, and every one has a working default. You only need to touch these if something about your setup is unusual.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8420` | Port the server listens on |
| `HOST` | `0.0.0.0` | Interface the server binds to |
| `POCKET_DATA_DIR` | `/data` in Docker, `./data` locally | Where the database and cached images live |
| `POCKET_DB_PATH` | `<data dir>/pocket.db` | Override just the database file path |
| `POCKET_CLIENT_DIR` | `<repo>/client/dist` | Where the built frontend is served from |
| `POCKET_BLOCK_PRIVATE_ADDRESSES` | `true` | Blocks metadata fetches to private and reserved addresses |
| `POCKET_FETCH_TIMEOUT_MS` | `12000` | Whole-request budget for one metadata fetch |
| `POCKET_MAX_HTML_BYTES` | `2097152` | How much of a page Pocket will read |
| `POCKET_MAX_IMAGE_BYTES` | `6291456` | Largest preview image it will cache |
| `POCKET_MAX_REDIRECTS` | `5` | Redirect hops allowed per fetch |
| `POCKET_MAX_UPLOAD_BYTES` | `33554432` | Largest bookmark file you can import |
| `POCKET_USER_AGENT` | a Pocket-identifying string | User agent sent when fetching pages |

## Access and security

Pocket is built for a single person on a trusted LAN. It has no authentication. Do not put it on the open internet as-is. If you need it from outside the house, put it behind a reverse proxy with auth, or reach it over a private network like Tailscale or WireGuard.

The one thing Pocket does defend against is server-side request forgery, because saving a bookmark makes the server fetch a URL you gave it. Outbound requests go through an agent that resolves hostnames and refuses to connect to loopback, private, link-local, carrier-grade NAT, and reserved addresses. The check runs at connect time rather than before the request, so a DNS answer that changes in between still cannot get through, and literal IP addresses are checked separately since they never hit DNS at all. Redirects are followed by hand, one hop at a time, and each hop is re-checked. Responses are capped by size and downloaded images are identified by their actual bytes rather than the `Content-Type` header the server claimed.

Cached images are served with `Content-Security-Policy: default-src 'none'; sandbox` and `X-Content-Type-Options: nosniff`, since those bytes came from the open web.

## How it works

The server is Express on Node, with SQLite through better-sqlite3. The frontend is React and TypeScript, built with Vite and styled with Tailwind. In production one Node process serves both the API and the built frontend, which is why there is one container and one port.

Saving a bookmark writes the row immediately and queues a metadata job. A small in-process queue runs up to three of those at a time, fetches the page, parses it with cheerio, downloads the first usable preview image and favicon, and updates the row. The frontend polls while anything is still pending, so cards fill themselves in. If the fetch fails the bookmark stays exactly where it is and the card shows a fallback with a "no preview" marker. Jobs still marked pending when the process stops are picked back up on the next start.

Duplicate detection compares a normalized form of the URL: lowercased host with `www.` stripped, no fragment, no tracking parameters, sorted query, no trailing slash. The URL you actually typed is stored untouched.

Cached images are named by a hash of their content, so two bookmarks that share a preview share one file. Deleting a bookmark only removes an image once nothing else points at it.

```text
server/src/
  routes/       HTTP layer, request validation
  services/     bookmarks, collections, tags, metadata, images, the job queue
  lib/          URL normalization, the SSRF guard, the fetch client
  db/           connection and migrations
client/src/
  components/   UI, with primitives under components/ui
  hooks/        the library state hook
  lib/          API client, routing, formatting
```

## Project status

I have run it against real sites, imported and re-imported browser exports, and verified the Docker image end to end on x86. What has not been tested yet:

- A real NAS deployment. I built and ran the container locally, not on Synology or Unraid.
- arm64. better-sqlite3 ships arm64 prebuilds and the Dockerfile does not compile anything, so it should work, but I have not run it.
- Large libraries. Search uses `LIKE` rather than a full-text index, which is fine for a few thousand bookmarks and will get slow well before a hundred thousand.

Not everything on the roadmap is built. Screenshot generation, a browser extension, and bulk editing are all listed in [DOCS/ROADMAP.md](DOCS/ROADMAP.md) and none of them exist yet.

## License

Apache 2.0. See [LICENSE](LICENSE).

Made with 💖 by [Pink Pixel](https://pinkpixel.dev)

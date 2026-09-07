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
- Custom covers. Upload your own image, drop one in, or paste a link to one, for any bookmark whose preview is missing or just ugly.
- Eight accent colors in Settings (Gold, Blue, Red, Green, Cyan, Purple, Pink, Teal), with automatic logo color matching.
- Collections (one per bookmark) and tags (as many as you want).
- Optional AI filling. Add an OpenAI key and Pocket fills in whatever the page did not give you: title, description, tags, and which collection the link belongs in. Off unless you set a key.
- Search across titles, URLs, descriptions, site names, and tags.
- Pinned bookmarks, which float to the top of every view.
- Grid view for browsing and list view for scanning or tidying up.
- Three card sizes, set in Settings. Small fits the most links on screen, large gives you the biggest previews.
- Mobile PWA support. Add Pocket to your phone home screen for a standalone app experience.
- Import from any browser's bookmark HTML export. Folders become collections, and links you already have are skipped.
- Export as browser-compatible HTML, or as JSON that also keeps your collections and tags.

## What it does not do

No accounts, no cloud sync, no page archiving, no screenshot rendering. Pocket has no login of its own, so it belongs on a trusted network or behind a reverse proxy that handles authentication. See [Access and security](#access-and-security).

## Filling in links with AI

This part is optional and off until you add an OpenAI key. Without one you will not see a single AI control anywhere in the app.

I added it because I am lazy about filing things. Some sites hand over a good title and description and some hand over nothing, and the ones that hand over nothing are the ones that sit untagged in "No collection" forever. So the AI pass runs *after* the normal preview fetch, looks at what is still blank, and fills only that in. A title you typed yourself is never overwritten. Neither is a description, a collection, or a tag you added.

To turn it on, open Settings, paste a key into "Filling in links with AI", and pick a model. `gpt-5.4-nano` is the default and costs a fraction of a cent per bookmark. From then on every new link you save gets filled in on its own, a few seconds after the preview arrives.

For links you saved before that, use "Fill in with AI" in any card's menu.

Two things worth knowing:

- The key is stored as plain text in your Pocket database, which means it is also in your backups. If you would rather it never touched the database, set `POCKET_OPENAI_API_KEY` instead. The environment always wins, and Pocket then refuses to let the browser change it.
- Imported bookmarks are skipped. A browser export can be thousands of links, and filling all of them in automatically would be a bill you did not agree to. Run those one at a time from the card menu.

Pocket sends the URL, the site name, whatever title and description it already has, about 1500 characters of the page's own text, and your existing collections and tags. Each collection goes over with a couple of the titles already filed under it, because a name on its own is not much to judge a fit by. The instruction is to reuse a collection only when the link is genuinely about the same subject, and to make a new one when it is torn, since a collection that collects unrelated things is not worth much. It sends `store: false`, so OpenAI keeps no copy.

When you are filing something by hand, the collection dropdown in the add and edit dialogs has a "+ Create new collection" option, so you do not have to close the dialog to make one first.

## Covers

Some pages have no preview image, and some have one you would rather not look at. Either way you can set your own cover.

Open a bookmark's menu and pick "Add a cover", or edit it and use the Cover section. You have three ways in:

- Upload an image from the device you are on, phone included.
- Drag an image file onto the cover box, or drag one straight out of another browser tab.
- Paste a link to an image and press Use. Pocket downloads it through the same address guard as everything else.

A cover replaces the fetched preview everywhere: grid cards, list rows, and the edit dialog. The fetched preview is still there underneath, so removing the cover brings it back, and "Refresh preview" never overwrites a cover you chose.

Covers save as soon as you pick one, separately from the rest of the form. You do not have to press Save changes afterwards.

## Appearance and accent colors

Pocket uses a dark theme built for low glare. In Settings > Appearance, you can choose from eight accent colors:

- Gold (default)
- Blue
- Red
- Green
- Cyan
- Purple
- Pink
- Teal

The Pocket logo in the header tints dynamically to match the accent you pick. Your choice is stored locally in the browser and applied before mount, so you never get a flash of the default color on page refresh.

## Running it with Docker

The easiest way to run Pocket is with the published Docker image.

### Using Docker Run

```bash
mkdir -p data
docker run -d \
  --name pocket \
  --restart unless-stopped \
  -p 8420:8420 \
  -v ./data:/data \
  pinkpixeldev/pocket:latest
```

Open `http://localhost:8420` (or your server's IP address).

### Using Docker Compose

Create a `compose.yml` file:

```yaml
services:
  pocket:
    image: pinkpixeldev/pocket:latest
    container_name: pocket
    restart: unless-stopped
    ports:
      - '8420:8420'
    volumes:
      - ./data:/data
    environment:
      - TZ=UTC
      # Optional: set your OpenAI key here instead of in Settings
      # - POCKET_OPENAI_API_KEY=your-key-here
```

Start the container:

```bash
docker compose up -d
```

The `data` directory holds `pocket.db` and the cached `previews/`, `favicons/`, and `covers/` folders. It is bind-mounted into the container, so updating the image does not touch your bookmarks.

The container runs as user `node` (uid 1000). If your NAS storage is owned by a different account, set `user: 'uid:gid'` in your compose file to match, and make sure the `data` directory is writable by that account.

Full deployment instructions, including backup, restore, reverse proxies, and troubleshooting, are in [DOCS/DEPLOYMENT.md](DOCS/DEPLOYMENT.md).

## Running it locally

If you want to run or develop Pocket directly from source, you need Node 22 or newer.

```bash
git clone https://github.com/pinkpixel-dev/pocket.git
cd pocket
npm install
npm run dev
```

That starts the API on port 8420 and the Vite dev server on port 5273, which proxies `/api` and `/media` through to the API. Open `http://localhost:5273`.

To build and run the production server locally:

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
| `POCKET_MAX_COVER_BYTES` | `10485760` | Largest cover image you can upload |
| `POCKET_USER_AGENT` | a Pocket-identifying string | User agent sent when fetching pages |
| `POCKET_OPENAI_API_KEY` | unset | An OpenAI key. Setting it turns on AI filling and stops the browser from changing the key |
| `POCKET_OPENAI_BASE_URL` | `https://api.openai.com/v1` | Point this at an OpenAI-compatible endpoint if you run one |
| `POCKET_OPENAI_TIMEOUT_MS` | `60000` | How long to wait for a model to answer |
| `POCKET_AI_EXCERPT_CHARS` | `1500` | How much page text goes into the prompt |

## Access and security

Pocket is built for a single person on a trusted LAN. It has no authentication. Do not put it on the open internet as-is. If you need it from outside the house, put it behind a reverse proxy with auth, or reach it over a private network like Tailscale or WireGuard.

The one thing Pocket does defend against is server-side request forgery, because saving a bookmark makes the server fetch a URL you gave it. Outbound requests go through an agent that resolves hostnames and refuses to connect to loopback, private, link-local, carrier-grade NAT, and reserved addresses. The check runs at connect time rather than before the request, so a DNS answer that changes in between still cannot get through, and literal IP addresses are checked separately since they never hit DNS at all. Redirects are followed by hand, one hop at a time, and each hop is re-checked. Responses are capped by size and downloaded images are identified by their actual bytes rather than the `Content-Type` header the server claimed.

Cached images are served with `Content-Security-Policy: default-src 'none'; sandbox` and `X-Content-Type-Options: nosniff`, since those bytes came from the open web.

## How it works

The server is Express on Node, with SQLite through better-sqlite3. The frontend is React and TypeScript, built with Vite and styled with Tailwind. In production one Node process serves both the API and the built frontend, which is why there is one container and one port.

Saving a bookmark writes the row immediately and queues a metadata job. A small in-process queue runs up to three of those at a time, fetches the page, parses it with cheerio, downloads the first usable preview image and favicon, and updates the row. When a key is set, that job then queues a second one that asks the model to fill in what is still blank, reusing the page text the first job already parsed rather than downloading the page again. The frontend polls while anything is still pending, so cards fill themselves in. If the fetch fails the bookmark stays exactly where it is and the card shows a fallback with a "no preview" marker. Jobs still marked pending when the process stops are picked back up on the next start.

Duplicate detection compares a normalized form of the URL: lowercased host with `www.` stripped, no fragment, no tracking parameters, sorted query, no trailing slash. The URL you actually typed is stored untouched.

Cached images are named by a hash of their content, so two bookmarks that share a preview share one file. Deleting a bookmark only removes an image once nothing else points at it.

```text
server/src/
  routes/       HTTP layer, request validation
  services/     bookmarks, collections, tags, metadata, images, AI, settings, the job queue
  lib/          URL normalization, the SSRF guard, the fetch client
  db/           connection and migrations
client/src/
  components/   UI, with primitives under components/ui
  hooks/        the library state hook
  lib/          API client, routing, formatting
```

## Project status

I have run it against real sites, imported and re-imported browser exports, and verified the Docker image end to end on x86 and arm64. What has not been tested yet:

- A real NAS deployment on commercial hardware. I built and ran the container locally, not on Synology or Unraid directly.
- Large libraries. Search uses `LIKE` rather than a full-text index, which is fine for a few thousand bookmarks and will get slow well before a hundred thousand.

Not everything on the roadmap is built. Screenshot generation, a browser extension, and bulk editing are all listed in [DOCS/ROADMAP.md](DOCS/ROADMAP.md) and none of them exist yet.

## License

Apache 2.0. See [LICENSE](LICENSE).

Made with 💖 by [Pink Pixel](https://pinkpixel.dev)

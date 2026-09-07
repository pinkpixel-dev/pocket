---
id: bookmarks
title: Bookmarks & Previews
---

# Bookmarks & Previews

Pocket treats every bookmark as a rich card with full metadata, cached assets, and editable covers.

## Adding a bookmark

To save a new link, click the **+ Add link** button or press the keyboard shortcut in the header:

1. Paste the URL into the input field.
2. Select a collection, or choose **+ Create new collection** from the dropdown without leaving the dialog.
3. Add optional tags.
4. Click **Save**.

The dialog closes immediately and your link is added to the database. Pocket does not wait for the target website to respond. The metadata extraction pipeline runs asynchronously in the background.

```text
User clicks Save
  ├── 1. Bookmark row inserted into SQLite (metadata_status: 'pending')
  ├── 2. UI immediately renders bookmark card with spinner
  └── 3. Background job enqueued
        ├── Fetch HTML & parse metadata (OG, Twitter cards, title)
        ├── Download and cache favicon to data/favicons/
        ├── Download and cache preview to data/previews/
        └── Update bookmark status to 'ok'
```

## Preview images and fallbacks

When Pocket crawls a saved link:

1. It parses Open Graph (`og:image`), Twitter Cards (`twitter:image`), and HTML page tags.
2. The highest-resolution candidate is fetched and validated.
3. The image is cached on disk in `data/previews/` and served directly from your server under `/media/previews/`.

### Designed initials fallback

If a website does not provide an image, Pocket does not leave an empty or broken grey box. It creates a fallback card displaying:

* The cached site favicon.
* The website initials.
* A subtle color tint deterministically computed from the domain name, making cards from the same website visually recognizable at a glance.

## Custom covers

Some websites have low-resolution social preview cards or ugly generic logos. Pocket lets you set your own cover for any bookmark:

1. Click the three-dot menu on any bookmark card or row.
2. Choose **Edit cover**.
3. You can either:
   * **Upload an image:** Pick an image from your computer or phone.
   * **Paste an image link:** Pocket fetches and caches that specific URL.
4. Click **Save cover**.

Custom covers are stored in `data/covers/`. A custom cover always takes priority over fetched previews. Even if you run a metadata refresh on the bookmark, your custom cover is never overwritten. If you remove the custom cover later, Pocket seamlessly displays the original fetched preview again.

## Pinning bookmarks

For bookmarks you access daily (such as your home dashboard, router, or NAS administration panels), click the three-dot menu and select **Pin bookmark**.

Pinned bookmarks:
* Always stay at the very top of your library in both Grid and List views.
* Display a pin icon indicator.
* Remain pinned across collection filtering and search queries.

## Searching your library

The global search input filters your library in real-time as you type. Pocket matches queries across:

* Bookmark titles
* Normalized and raw URLs
* Stored page descriptions
* Site hostnames
* Attached tags

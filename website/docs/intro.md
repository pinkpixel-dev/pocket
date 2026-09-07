---
id: intro
title: Introduction
slug: /intro
---

# What is Pocket?

Pocket is a self-hosted bookmark manager built specifically for home servers and network attached storage (NAS). When you paste a URL, Pocket fetches the title, description, favicon, and preview image in the background, giving you clean visual cards you can organize and find later.

Everything is stored locally on your own hardware inside a single SQLite database, with cached preview images stored alongside it. Nothing leaves your machine except the outbound requests Pocket makes to fetch page metadata when saving a link.

```text
┌────────────────────────────────────────────────────────┐
│                      Your Browser                      │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / Port 8420
┌───────────────────────────▼────────────────────────────┐
│                    Pocket Container                    │
│  ┌──────────────────────┐    ┌──────────────────────┐  │
│  │    React Frontend    │    │   Node/Express API   │  │
│  └──────────────────────┘    └──────────┬───────────┘  │
│                                         │              │
│       ┌─────────────────────────────────┴──┐           │
│       ▼                                    ▼           │
│  ┌──────────────┐                  ┌───────────────┐   │
│  │ data/        │                  │ In-Memory     │   │
│  │  pocket.db   │ (SQLite + WAL)   │ Job Queue     │   │
│  │  previews/   │ (Cached images)  │  - Metadata   │   │
│  │  covers/     │ (Custom covers)  │  - Link check │   │
│  └──────────────┘                  └───────────────┘   │
└────────────────────────────────────────────────────────┘
```

## Why Pocket exists

Browser bookmark bars become cluttered and hard to navigate once you pass a couple hundred links. Hosted bookmarking services either require recurring monthly subscriptions, harvest your browsing habits for analytics, or force you into a heavy read-it-later workflow with bloated article archives.

Pocket focuses on one job: saving links reliably, extracting clean metadata, organizing them without clutter, and letting you find them instantly from any phone, laptop, or desktop on your local network.

## What Pocket does

* **One-paste saving:** Paste a URL and Pocket immediately saves the link. Metadata extraction runs in the background so slow or unresponsive websites never freeze the interface.
* **Local card previews:** Extracts Open Graph and Twitter card images, caches them locally, and optimizes them for rapid browsing.
* **Deterministic fallbacks:** If a page has no preview image, Pocket generates a clean fallback using the site favicon, initials, and an accent color keyed to the domain name.
* **Custom covers:** Upload your own image or paste an image link to replace any missing or low-quality preview.
* **Collections and tags:** File links into a single collection (shelf style) and attach as many flexible tags as you need.
* **Selection mode:** Bulk delete, move to collections, unfile to backlog, or run AI sorting across dozens of bookmarks at once.
* **Multi-user isolation:** Multiple household members can share one container on a NAS while keeping separate libraries, accounts, collections, and AI settings.
* **Optional AI assistance:** Connect an OpenAI API key to automatically fill missing titles, suggest summaries, file backlog links, and clean up duplicate tags.
* **Browser import and export:** Import bookmarks from Chrome, Firefox, or Safari HTML files, with an optional post-import dead link health audit.
* **Mobile PWA:** Install Pocket to your phone home screen for a full-screen, touch-optimized app experience.

## What Pocket does not do

* **No cloud dependencies:** Pocket does not connect to external sync servers, telemetry collectors, or central identity providers.
* **No full page archiving:** Pocket stores page metadata, descriptions, and preview images, but does not archive full HTML snapshots or PDF prints of articles.
* **No open registrations:** There is no public registration form. The first user to run setup claims the owner account, and the owner creates accounts for others directly from Settings.

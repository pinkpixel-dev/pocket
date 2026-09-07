---
id: configuration
title: AI Configuration
---

# AI Configuration & Setup

Pocket includes an optional AI enrichment pipeline powered by OpenAI. When enabled, Pocket automatically fills in missing metadata, generates concise descriptions, assigns relevant tags, and categorizes links into clean collections.

:::info AI is completely optional
If you do not provide an OpenAI API key, AI features remain dormant. No network requests are made to OpenAI, and no AI buttons or prompts will appear in the interface.
:::

## Configuring your OpenAI key

You can configure your API key in two ways: per-user in the web interface, or shared across all users via an environment variable.

### Option 1: Per-user key (in Settings)

1. Open Pocket in your browser and sign in.
2. Click the gear icon in the sidebar or header to open **Settings**.
3. Select **Filling in links with AI**.
4. Paste your OpenAI API key (`sk-...`).
5. Select your preferred model (such as `gpt-5.4-nano`).
6. Click **Save settings**.

When configured through Settings, the key is saved into your personal SQLite settings table and encrypted in your local database. Each user on your server can supply their own key so costs are never mixed.

### Option 2: Shared fallback key (Environment variable)

If you are hosting Pocket for a family or household and want everyone to share a single OpenAI subscription without requiring each person to get an API key, set `POCKET_OPENAI_API_KEY` in your `compose.yml`:

```yaml
services:
  pocket:
    image: ghcr.io/pinkpixel-dev/pocket:latest
    container_name: pocket
    environment:
      - PORT=8420
      - POCKET_OPENAI_API_KEY=sk-proj-yourSharedKeyHere
```

* Any account that has not entered a personal key will automatically use this shared fallback.
* If an account enters their own key in Settings, their personal key takes precedence.

## How automated enrichment works

When a new bookmark is added:

1. Pocket first fetches the page HTML, favicon, and preview image.
2. If the page lacks a description or title, the AI enrichment job triggers.
3. Pocket extracts up to 1,500 characters of readable text from the page, along with your existing list of collections and frequently used tags.
4. The AI returns a concise title, a two-sentence summary, 2 to 4 focused tags, and a suggested collection.
5. Pocket saves the new attributes into your database.

### Safeguards and user edits

* **User data is sacred:** Pocket will never overwrite a title, description, or tag that you manually typed or edited.
* **No surprise bills on import:** When importing hundreds or thousands of bookmarks from an HTML browser export, automated AI filing is intentionally bypassed. You can run AI filing on selected links using **Selection Mode** or from individual card menus whenever you wish.
* **Privacy guarantee:** Every OpenAI request is sent with `"store": false`. OpenAI does not retain or train on your saved bookmarks.

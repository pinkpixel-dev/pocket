---
id: organization
title: Organization & Selection Mode
---

# Organization & Selection Mode

Pocket organizes links using two complementary concepts: Collections for shelf placement, and Tags for cross-cutting labels.

## Collections vs. Tags

### Collections (One per bookmark)
A collection acts like a physical shelf. Each bookmark belongs to exactly one collection, or sits in **No collection** (your inbox/backlog). This keeps your sidebar tidy and prevents links from becoming scattered across multiple redundant folders.

* You can rename, delete, or merge collections anytime.
* Deleting a collection gives you the option to delete its bookmarks or unfile them to "No collection".

### Tags (Multiple per bookmark)
Tags are lightweight, multi-dimensional labels. You can assign as many tags to a bookmark as you want:

* Examples: `self-hosted`, `docker`, `read-later`, `recipe`, `tools`.
* Selecting a tag filters the active view to all bookmarks carrying that tag, regardless of which collection they belong to.
* Tags can be merged in bulk from Settings to clean up plurals and synonyms.

## Resizable sidebar

The navigation sidebar on desktop is resizable:

* Drag the right edge of the sidebar to adjust its width.
* When focused via keyboard, you can use the left and right arrow keys to resize.
* Your customized width is automatically saved and remembered across sessions.

## Selection mode (Bulk actions)

When cleaning up large imports or reorganizing your library, click the **Select** button in the toolbar to enter Selection Mode.

Selection Mode enables checkboxes on every card and row:

```text
┌─────────────────────────────────────────────────────────────┐
│ Toolbar: [ 14 selected ] [ Move ] [ Unfile ] [ Delete ]     │
├─────────────────────────────────────────────────────────────┤
│  [✓] Docker Docs        [✓] Synology KB     [ ] GitHub      │
│  [✓] Portainer Guide    [✓] Caddy Docs      [ ] Reddit      │
└─────────────────────────────────────────────────────────────┘
```

Available bulk operations:
* **Move to collection:** Move all selected bookmarks into an existing collection, or create a new collection on the fly.
* **Unfile:** Remove the collection assignment from selected bookmarks, sending them to the unfiled backlog.
* **Delete:** Permanently remove selected bookmarks in a single action.
* **AI filing:** Run the AI classification pass on only the selected items.

To exit selection mode, click **Done** in the toolbar or press `Escape`.

## View modes and card sizes

### Grid view vs. List view
* **Grid view:** Optimized for visual browsing, featuring page preview cards, site favicons, and cover art.
* **List view:** A dense, high-efficiency tabular layout designed for fast scanning, reading long titles, and managing large libraries.

### Card sizes
Under **Settings > Appearance**, you can choose between three card sizes for Grid view:

1. **Small:** Compact previews that fit the maximum number of links on your display.
2. **Medium:** Balanced default layout showing preview art, title, and site name.
3. **Large:** Prominent, high-resolution preview cards with full description snippets.

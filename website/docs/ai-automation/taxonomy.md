---
id: taxonomy
title: AI Taxonomy & Organization
---

# AI Taxonomy & Organization

Standard AI classification tools fail on large libraries because they evaluate links one by one. Without seeing the bigger picture, an AI will quickly create dozens of redundant single-link collections like "AI Music", "AI Sound", "AI Prompting", and "AI Tools".

Pocket solves this with a two-pass taxonomy architecture.

## Two-pass batch collection filing

When you run **Sort unfiled bookmarks** from **Settings > Collections and tags**:

```text
Pass 1: Shelf Planning
  ├── Inspects the entire unfiled backlog
  └── Plans a small, coherent list of broad collections
      (Aiming for ~1 collection per 12 unfiled bookmarks)

Pass 2: Constrained Categorization
  ├── Files bookmarks in chunks of 40 against the planned shelf list
  └── Any newly invented name outside the approved list is discarded
```

By constraining the model to its own planned schema, Pocket keeps your sidebar clean and prevents collection sprawl. Any fine-grained topic distinctions are routed into tags rather than cluttering your collection list.

## Collection tidy-up and merging

If your collection list has grown disorganized over time, open **Settings > Collections and tags** and click **Review collections**.

1. Pocket reviews your active collection names.
2. It identifies fragmented collections that belong under a broader category (for example, consolidating "TypeScript", "React", and "Vite" under "Web Development").
3. **Preserving detail with tags:** When merging "AI Music" into "AI", Pocket automatically attaches an `AI Music` tag to all moved bookmarks. You keep the specific detail without cluttering your collection tree.
4. You review the proposed merge list in an interactive dialog, uncheck any suggestions you disagree with, and click **Apply**.

## Tag deduplication & synonym cleanup

Tags tend to drift across similar synonyms, capitalization, and plurals (e.g., `llm`, `llms`, `large language models`, and `ai-models`).

Pocket provides a dedicated **Clean up tags** tool:

1. Pocket provides the AI with your top 80 tags sorted by frequency.
2. The model searches specifically for plurals, acronyms, and direct synonyms.
3. The AI proposes a clean consolidated vocabulary (e.g., folding `llms` into `llm`).
4. You inspect the proposed consolidation table and approve it.
5. All tag updates execute in a single atomic SQLite transaction.

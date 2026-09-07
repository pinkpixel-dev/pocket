---
id: models
title: Supported Models & Costs
---

# Supported Models & Costs

Pocket interacts with OpenAI using the Responses API with strict JSON schema definitions. This ensures every response conforms to Pocket's exact data types without parsing errors or conversational preamble.

## Recommended model: `gpt-5.4-nano`

For almost all users, **`gpt-5.4-nano`** is the recommended choice:

* **High speed:** Returns classification and descriptions in under 1 second.
* **Low cost:** Costs a fraction of a cent per bookmark. Enriching an active library of 500 bookmarks typically costs less than $0.05 total.
* **Strict schema adherence:** Consistently respects maximum character constraints (capping titles at 80 characters, descriptions at two sentences, and collections at 18 characters).

## Model catalogue

Pocket allows selecting from several models in **Settings > Filling in links with AI**:

| Model | Speed | Cost per 100 Links | Best For |
| :--- | :--- | :--- | :--- |
| **`gpt-5.4-nano`** | Under 1s | ~$0.005 | **Default & Recommended.** General bookmark tagging and collection classification. |
| **`gpt-4o-mini`** | Fast (~1s) | ~$0.015 | Balanced performance across complex foreign language websites. |
| **`gpt-4o`** | Moderate (~2s) | ~$0.15 | Dense technical and academic articles requiring nuanced summaries. |

## Structured outputs & privacy

Pocket constructs prompt payloads using OpenAI Structured Outputs:

```json
{
  "model": "gpt-5.4-nano",
  "store": false,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "bookmark_enrichment",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "description": { "type": "string" },
          "collection": { "type": "string" },
          "tags": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["title", "description", "collection", "tags"],
        "additionalProperties": false
      }
    }
  }
}
```

* **Data minimization:** Only the page URL, domain name, existing collection titles, and the first 1,500 characters of clean text are transmitted.
* **No storage:** Pocket sets `"store": false` on every API call, preventing OpenAI from saving the request or using your bookmarks for training.

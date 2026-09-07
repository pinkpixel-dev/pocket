---
id: link-health
title: Link Health & Security
---

# Link Health & Security

Pocket operates on your private local network while making outbound HTTP requests to the public internet to crawl saved links. It implements strict outbound address verification to protect your local network alongside an intelligent link health auditor.

## SSRF & Private Network Protection

When a user submits a URL to save, Pocket verifies the target before making any network requests:

* **Private range blocking:** Pocket refuses outbound connections to loopback addresses (`127.0.0.1`, `::1`), private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and link-local addresses (`169.254.0.0/16`).
* **Guarded DNS resolution:** Resolves DNS before initiating TCP connections and validates that the resolved IP does not map to an internal NAS service or router management console. This eliminates DNS rebinding attacks.

## Intelligent link health auditing

The link health checker verifies whether saved bookmarks are still accessible on the web.

Unlike simplistic tools that flag any non-200 HTTP code as broken, Pocket distinguishes between three distinct health states:

```text
HTTP Response
  ├── 200, 301, 302, 308 ──────────────► ALIVE (Healthy)
  ├── 401, 403, 405, 429, 451, 999 ────► ALIVE (Host answered, refused bot)
  ├── 500, 502, 503, 504, Timeout ─────► UNKNOWN (Transient error, untouched)
  └── 404, 410, DNS resolution failure ─► DEAD (Needs attention)
```

### Why rate limits and Cloudflare are not "dead"

Many modern websites (such as Cloudflare protected sites, dev.to, or LinkedIn) reject automated crawlers with an HTTP 403 Forbidden or 429 Too Many Requests status code. The page is alive and readable when clicked by a human.

Pocket recognizes these status codes as **alive**. It will never falsely mark a healthy bookmark as broken just because the target host declined an automated preview fetch.

### Fast header probing

Pocket sends an HTTP GET request with `probeOnly: true`. The moment response headers arrive and the status code is determined, the body stream is terminated immediately. Pocket does not download gigabytes of unnecessary HTML, keeping link checks fast and resource-efficient.

### Dismissing broken status without deletion

If a site was temporarily down during a scan and received a "Needs attention" badge:

1. Click the three-dot menu on the card.
2. Select **Mark as working**.
3. Pocket clears the error status and restores the card to active status, preserving all your tags and descriptions.

You can also click **Re-check link** to immediately run a fresh live probe.

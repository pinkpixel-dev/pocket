---
id: multi-user
title: Multi-User Isolation & Security
---

# Multi-User Isolation & Security

Pocket is designed so an entire household or team can share one server instance without compromising privacy or sharing bookmarks.

## User roles and isolation model

There are two roles in Pocket:
1. **Owner:** The first account created during initial setup. The owner can add new accounts, change passwords for locked-out users, and delete accounts from Settings.
2. **Standard Users:** Can create, edit, import, and delete their own bookmarks, collections, tags, covers, and personal AI configuration.

```text
┌─────────────────────────────────────────────────────────────┐
│                       Pocket Database                       │
├──────────────────────────────┬──────────────────────────────┤
│ User Alice (Owner)           │ User Bob (Member)            │
│  - Bookmarks & Covers        │  - Bookmarks & Covers        │
│  - Collections & Tags        │  - Collections & Tags        │
│  - Link Audit Queue          │  - Link Audit Queue          │
│  - OpenAI Key & Settings     │  - OpenAI Key & Settings     │
└──────────────────────────────┴──────────────────────────────┘
```

* **No cross-account visibility:** There is no "global search" or administrative inspection tool. The owner cannot view another user's bookmarks, tags, or links.
* **Independent namespaces:** Two users on the same server can save the same URL and each can have a collection named "Reading" without collision.

## Strict backend scoping

Pocket prevents cross-tenant access at the architecture level:

* Every scoped database query includes `AND user_id = ?`.
* The `userId` is extracted exclusively from the authenticated session cookie on the server (`userIdOf(req)`). It is never accepted from request parameters or client-side JSON bodies.
* If a request sends a collection ID or tag ID belonging to another user, Pocket rejects the operation with an HTTP 400 or 404 error rather than modifying foreign data.

## Authentication and sessions

### Password storage
Passwords are cryptographically derived using `node:crypto` `scrypt` with a per-user salt:

```text
scrypt$<salt_hex>$<hash_hex>
```

To prevent timing attacks, verifying an incorrect password and checking an unknown username both execute the full scrypt derivation.

### Session tokens
* When you sign in, Pocket generates 32 cryptographically secure random bytes.
* Only the SHA-256 hash of the token is stored in the `sessions` database table. If your database backup is ever exposed, raw session tokens cannot be recovered or replayed.
* Cookies are flagged with `HttpOnly`, `SameSite=Lax`, and a 30-day expiration window.

## Managing accounts

To create a new user:
1. Sign in as the owner account.
2. Open **Settings > Your account**.
3. Under **People on this Pocket**, click **Add someone**.
4. Enter their desired username and temporary starting password.
5. The new user can now sign in at the server URL and update their password under their own Settings page.

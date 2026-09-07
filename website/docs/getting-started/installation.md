---
id: installation
title: Installation Guide
---

# Installation Guide

Detailed deployment considerations, volume storage, file permissions, and reverse proxy configurations.

## System requirements

* **Runtime:** Docker Engine 20.10+ and Docker Compose v2.
* **Architecture:** Supports `linux/amd64` (Intel/AMD) and `linux/arm64` (Apple Silicon, Raspberry Pi 4/5).
* **Memory:** 150 MB baseline RAM.
* **Storage:** 400 MB for the image, plus storage for cached previews. A library of 2,000 bookmarks usually consumes 300 to 500 MB of image cache.

## File permissions and ownership

The Pocket container runs as the unprivileged `node` user with UID 1000 and GID 1000. If your host directory is owned by root or a different NAS system user, Pocket cannot create or write to `pocket.db`.

You have two solutions:

### Option A: Adjust host folder permissions

Set the mounted folder ownership to UID 1000:

```bash
sudo chown -R 1000:1000 ./data
```

### Option B: Run container as custom UID

Find your NAS or host user UID and GID by running `id <username>`. Then configure the container to run under those IDs in `compose.yml`:

```yaml
services:
  pocket:
    image: ghcr.io/pinkpixel-dev/pocket:latest
    container_name: pocket
    user: '1026:100'
    restart: unless-stopped
    ports:
      - '8420:8420'
    volumes:
      - ./data:/data
```

## Reverse proxy setup

Pocket runs behind any standard reverse proxy. When accessing Pocket over HTTPS, cookies should be marked secure. Pocket automatically detects HTTPS when `X-Forwarded-Proto: https` is forwarded, or you can force it by setting `POCKET_SECURE_COOKIES=1`.

### Caddy

Caddy automatically handles HTTPS certificates and sets required proxy headers:

```caddyfile
pocket.local.example {
    reverse_proxy 127.0.0.1:8420
}
```

### Nginx

If running Nginx, configure the proxy headers properly:

```nginx
server {
    listen 443 ssl http2;
    server_name pocket.local.example;

    ssl_certificate /etc/letsencrypt/live/pocket.local.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pocket.local.example/privkey.pem;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:8420;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Cloudflare Tunnels

If you run Cloudflare Tunnels (`cloudflared`), map the service to `http://localhost:8420`.

In your `compose.yml`, set:

```yaml
environment:
  - POCKET_SECURE_COOKIES=1
```

This ensures session cookies are protected across the Cloudflare edge.

## Updating Pocket

To update to the latest release:

```bash
docker compose pull pocket
docker compose up -d pocket
```

SQLite schema migrations run automatically on startup. Pocket wraps migrations in database transactions and checks integrity before accepting traffic.

---
id: configuration
title: Configuration Reference
---

# Configuration Reference

All runtime options for Pocket can be configured via environment variables in `compose.yml` or your NAS container manager.

## Environment variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8420` | The internal TCP port the Node.js Express server listens on. |
| `HOST` | `0.0.0.0` | The network interface Pocket binds to inside the container. |
| `POCKET_DATA_DIR` | `/data` | Absolute path inside the container where `pocket.db` and cached images are stored. |
| `POCKET_OPENAI_API_KEY` | *(None)* | Shared fallback OpenAI API key used by any account that has not entered a personal key in Settings. |
| `POCKET_SECURE_COOKIES` | *(Auto)* | Set to `1` to force the `Secure` flag on session cookies when operating behind an SSL-terminating reverse proxy. |
| `POCKET_JOB_TIMEOUT_MS` | `30000` | Maximum timeout in milliseconds allocated to a single metadata enrichment job. |
| `POCKET_PROBE_USER_AGENT` | *(Browser UA)* | User agent string utilized when performing browser-level retry checks for rate-limited websites. |

## Production compose.yml example

Here is a full production `compose.yml` demonstrating these configuration options:

```yaml
services:
  pocket:
    image: ghcr.io/pinkpixel-dev/pocket:latest
    container_name: pocket
    restart: unless-stopped
    ports:
      - '8420:8420'
    volumes:
      - /volume1/docker/pocket/data:/data
    environment:
      - PORT=8420
      - POCKET_DATA_DIR=/data
      - POCKET_SECURE_COOKIES=1
      - POCKET_OPENAI_API_KEY=sk-proj-exampleSharedKey
    healthcheck:
      test: ['CMD', 'wget', '--spider', '-q', 'http://127.0.0.1:8420/api/users']
      interval: 30s
      timeout: 5s
      retries: 3
```

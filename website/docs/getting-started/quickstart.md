---
id: quickstart
title: Quickstart
---

# Quickstart

Get Pocket up and running with Docker Compose in under a minute.

## 1. Create directory structure

Create an empty folder for Pocket and create a `data` directory beside your configuration:

```bash
mkdir -p pocket/data
cd pocket
```

## 2. Create compose.yml

Save the following content into a `compose.yml` file:

```yaml
services:
  pocket:
    image: ghcr.io/pinkpixel-dev/pocket:latest
    container_name: pocket
    restart: unless-stopped
    ports:
      - '8420:8420'
    volumes:
      - ./data:/data
    environment:
      - PORT=8420
      # Optional: shared OpenAI fallback key for all household accounts
      # - POCKET_OPENAI_API_KEY=sk-...
```

## 3. Start the container

Launch the container in the background:

```bash
docker compose up -d
```

Check the logs to ensure the database initializes properly:

```bash
docker compose logs -f pocket
```

You will see the database migrations execute and the Express server start listening on port 8420.

## 4. Run initial setup

Open your browser and navigate to:

```text
http://<server-ip>:8420
```

When you first open Pocket, the setup screen prompts you to create the initial owner account. Choose a username and a strong password. This account has administrative privileges to manage other user accounts from Settings.

## Next steps

* Check out the [Installation Guide](/docs/getting-started/installation) for reverse proxy setup and file permissions.
* Read the [NAS Guides](/docs/getting-started/nas-guides) for Synology, TrueNAS, and Unraid specific instructions.
* Configure [AI Automation](/docs/ai-automation/configuration) to automate bookmark organization.

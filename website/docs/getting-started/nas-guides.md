---
id: nas-guides
title: NAS Setup Guides
---

# NAS Setup Guides

Step-by-step instructions for deploying Pocket on popular home server and NAS operating systems.

## Synology DSM (Container Manager)

Synology DSM 7.2+ includes Container Manager with built-in Docker Compose support.

1. Open **File Station** and navigate to your `docker/` share.
2. Create a folder named `pocket`, and inside it create an empty folder named `data`.
3. Open **Container Manager** from the DSM main menu.
4. Navigate to **Project** in the left sidebar and click **Create**.
5. Set the project parameters:
   * **Project Name:** `pocket`
   * **Path:** Select the `docker/pocket` folder you created in File Station.
   * **Source:** Select **Create docker-compose.yml** and paste:

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
```

6. Complete the wizard. Container Manager will pull the image and launch Pocket.
7. Open `http://<synology-ip>:8420` in your browser.

:::tip Permissions on Synology
If the container stops with an EACCES database error, right-click the `docker/pocket/data` folder in File Station, choose **Properties**, switch to the **Permission** tab, and ensure your user or the `Everyone` group has Read & Write access.
:::

---

## TrueNAS SCALE

TrueNAS SCALE allows running custom Docker images via Apps.

1. Go to **Apps** in the TrueNAS web interface and click **Discover Apps**.
2. Click **Custom App** in the upper right corner.
3. Configure the application:
   * **Application Name:** `pocket`
   * **Image repository:** `ghcr.io/pinkpixel-dev/pocket`
   * **Image tag:** `latest`
4. Under **Port Forwarding**:
   * **Container Port:** `8420`
   * **Node Port:** `8420` (or another free port in your TrueNAS range)
5. Under **Storage**:
   * Choose **Host Path**.
   * Set **Mount Path:** `/data`
   * Set **Host Path:** Select your dataset path (e.g., `/mnt/pool/apps/pocket/data`).
6. Click **Install**. Once active, open the configured IP and port.

---

## Unraid

You can deploy Pocket on Unraid using the Docker tab:

1. Open the **Docker** tab in Unraid and click **Add Container**.
2. Fill in the container fields:
   * **Name:** `pocket`
   * **Repository:** `ghcr.io/pinkpixel-dev/pocket:latest`
   * **Network Type:** `Bridge`
3. Add a port mapping:
   * **Container Port:** `8420`
   * **Host Port:** `8420`
4. Add a path mapping:
   * **Container Path:** `/data`
   * **Host Path:** `/mnt/user/appdata/pocket`
5. Click **Apply**. Unraid will download the image and start the container.

---

## QNAP (Container Station)

1. Open **Container Station** in QTS.
2. Go to **Applications** and click **Create**.
3. Name the application `pocket`.
4. Paste the `compose.yml` content into the editor.
5. Make sure the volume path points to your QNAP Container share:
   ```yaml
   volumes:
     - /share/Container/pocket/data:/data
   ```
6. Click **Validate** and **Create**.

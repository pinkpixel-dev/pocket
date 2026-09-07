# syntax=docker/dockerfile:1

# ---- build the frontend and compile the server -----------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
# Install scripts are skipped so no native toolchain is needed; esbuild is the
# one package that genuinely needs its script to place the right binary.
RUN npm ci --ignore-scripts && npm rebuild esbuild

COPY . .
RUN npm run build

# ---- resolve the runtime dependency tree on its own ------------------------
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
# better-sqlite3 bundles its prebuilt binaries in the published tarball, so the
# install script is skipped rather than dragging a C++ toolchain into the image.
RUN npm ci --omit=dev --ignore-scripts --workspace server --include-workspace-root \
 && node -e "require('better-sqlite3'); console.log('sqlite binding ok')"

# ---- the image that actually runs ------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8420 \
    POCKET_DATA_DIR=/data \
    POCKET_CLIENT_DIR=/app/client/dist

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY package.json ./

# The bundled `node` user owns the data directory; override with `user:` in
# compose if your NAS shares need a different uid.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

VOLUME ["/data"]
EXPOSE 8420

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8420)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]

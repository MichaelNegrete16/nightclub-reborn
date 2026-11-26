# Nightclub Reborn: the city server and the built game in one container.
# The data (database, uploaded songs, backups) and the game's mp3s live OUTSIDE the container, in volumes: rebuilding or replacing the
# container never touches them.

# 1. build the game (web/dist)
FROM node:22-bookworm-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 2. the server's dependencies
FROM node:22-bookworm-slim AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 3. what runs: the server, the game's rules it imports (web/src/core) and the built game
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    MAX_PER_IP=50 \
    DB_FILE=/data/nightclub.db \
    AUDIO_DIR=/data/audio \
    SAVES_DIR=/data/legacy-saves \
    SONGS_DIR=/songs
WORKDIR /app/server
COPY --from=deps /app/server/node_modules ./node_modules
COPY server/ ./
COPY web/src/core /app/web/src/core
COPY --from=web /app/web/dist /app/web/dist
RUN mkdir -p /data /songs && chown -R node:node /data /songs
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "--no-warnings", "index.mjs"]

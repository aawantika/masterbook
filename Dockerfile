# Single image containing both the built web app and the API server --
# Express serves the built React app as static files (see the
# webDistPath block in server/src/index.ts) alongside /api/*, so there's
# one process, one port, and one Cloudflare Tunnel target instead of a
# second container + an internal reverse proxy to wire up for a personal,
# single-machine deployment.
#
# Base image is a full Debian image (bookworm-slim), not -alpine --
# better-sqlite3 is a compiled native module, and Alpine's musl libc has a
# real history of prebuilt-binary/compile friction for it. Bookworm-slim
# avoids that risk entirely for a small one-time image-size cost.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 should get a prebuilt binary on this platform (x86_64
# glibc Linux is about the best-supported target there is for native Node
# addon prebuilds -- the real friction case researched earlier was
# ARM32/musl-libc/Alpine, neither of which apply to a plain x86_64 host).
# Installing a C toolchain anyway, in the build stage only (not carried
# into the runtime image), is cheap insurance against an unverified
# assumption -- this couldn't be tested against a real Docker build in the
# environment this Dockerfile was written in.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY server ./server
COPY web ./web
RUN npm run build -w web && npm run build -w server

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
# Plain `npm ci --omit=dev` (no --workspace filter) rather than trying to
# install only the server workspace's deps -- untested combinations of
# npm's workspace-filtering flags aren't worth the risk here (no Docker
# available in this environment to verify against); the cost of this
# simpler, safer version is a handful of unused web devDependencies-free
# runtime packages, immaterial at this app's scale.
RUN npm ci --omit=dev
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

EXPOSE 3001
CMD ["node", "server/dist/index.js"]

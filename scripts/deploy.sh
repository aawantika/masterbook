#!/bin/bash
# Pulls main and rebuilds/restarts the containers, but only when GitHub has
# commits this checkout doesn't -- run hourly by launchd on the host (see
# scripts/com.masterbook.deploy.plist), or by hand any time to deploy now.
# Most runs are a no-op `git fetch`.
set -euo pipefail

# launchd starts jobs with a minimal PATH; Docker Desktop's CLI lives here.
export PATH="$HOME/.docker/bin:/usr/local/bin:/usr/bin:/bin"

cd "$(dirname "$0")/.."
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# Docker Desktop may still be starting right after a login/reboot; the next
# hourly run will pick up anything missed.
if ! docker info >/dev/null 2>&1; then
  log "docker not running -- skipping"
  exit 0
fi

git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  exit 0
fi

# --ff-only: if someone edited or committed on this host directly, refuse
# rather than silently merging -- the host should only ever run what's on
# GitHub. Fix by hand (see the log), and the next run resumes.
log "deploying $(git rev-parse --short HEAD) -> $(git rev-parse --short origin/main)"
git checkout --quiet main
git pull --quiet --ff-only origin main
docker compose up -d --build 2>&1 | tail -5
docker image prune -f >/dev/null
log "deployed $(git rev-parse --short HEAD)"

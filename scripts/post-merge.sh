#!/usr/bin/env bash
set -euo pipefail

# Multiple task merges can trigger setup at once; serialize schema pushes.
exec 9>"${TMPDIR:-/tmp}/experiences-fun-post-merge.lock"
flock 9

pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push

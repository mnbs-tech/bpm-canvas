#!/usr/bin/env bash
# Builds the release kit: a zip of this app's source that someone can unzip on
# their own PC and run (docs/LOCAL_RUNBOOK.md). Served by the ⚙️ menu.
#
# Run it only when asked for a kit - it is deliberately NOT part of `npm run
# build` or the deploy, so the archive on the server is always one a person
# decided to publish. See CLAUDE.md, "リリースキット".
#
# The contents come from `git archive HEAD`, so only committed, tracked files
# ship: secrets.env and .htpasswd are gitignored and cannot leak in, and this
# host's deploy config (systemd/, nginx/) is excluded via .gitattributes.
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(node -p "require('./package.json').version")
out_dir="${WORKFLOW_KIT_DIR:-dist}"
name="workflow-builder-kit-v${version}"

if [ -n "$(git status --porcelain)" ]; then
  echo "warning: the working tree is not clean - the kit contains HEAD ($(git rev-parse --short HEAD)) only," >&2
  echo "         not your uncommitted edits. Commit first if they should ship." >&2
fi

mkdir -p "$out_dir"
# One kit at a time: the ⚙️ menu offers the newest, and old versions sitting
# next to it are just stale downloads waiting to be served by mistake.
rm -f "$out_dir"/workflow-builder-kit-*.zip
git archive --format=zip -9 --prefix="${name}/" -o "${out_dir}/${name}.zip" HEAD

echo "built ${out_dir}/${name}.zip ($(du -h "${out_dir}/${name}.zip" | cut -f1))"

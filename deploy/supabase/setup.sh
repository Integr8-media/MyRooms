#!/bin/sh
# Run ON THE VPS from the repo's deploy/ folder:  sh supabase/setup.sh
# Downloads the official self-hosted Supabase Docker files (pinned version),
# generates secrets and adds our localhost-only port override.
set -eu

SUPABASE_REF="self-hosted/v0.8.3"
TARGET="${1:-$HOME/myrooms/supabase}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ -e "$TARGET" ]; then
  echo "ERROR: $TARGET already exists. Remove it or pass another path." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --quiet --filter=blob:none --no-checkout --depth=1 --branch "$SUPABASE_REF" \
  https://github.com/supabase/supabase "$TMP/supabase"
(cd "$TMP/supabase" && git sparse-checkout init --cone && git sparse-checkout set docker && git checkout --quiet)

mkdir -p "$TARGET"
cp -rf "$TMP/supabase/docker/." "$TARGET"
cp "$HERE/docker-compose.localonly.yml" "$TARGET/"

cd "$TARGET"
cp .env.example .env
printf 'ref=%s\n' "$SUPABASE_REF" > .supabase-version
sh utils/generate-keys.sh
sh utils/add-new-auth-keys.sh
sh run.sh config add localonly

echo
echo "Supabase files are in $TARGET"
echo "Next: edit $TARGET/.env (URLs, dashboard login, SMTP) — see deploy/README.md step 3."

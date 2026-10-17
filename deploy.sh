#!/usr/bin/env bash
# Builds the app and publishes dist/ to the gh-pages branch of origin.
set -euo pipefail
npm run build
tmp=$(mktemp -d)
cp -r dist/. "$tmp/"
touch "$tmp/.nojekyll"
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="FaceTime AI deploy" -c user.email="deploy@users.noreply.github.com" commit -qm "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -f "$(cd - >/dev/null && git remote get-url origin)" gh-pages
echo "Deployed."

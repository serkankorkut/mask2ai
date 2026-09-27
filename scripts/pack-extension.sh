#!/bin/sh
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
out="dist/mask2ai-extension-$version.zip"
rm -f "$out"
zip -q -r "$out" manifest.json core/pii.js extension/rewrite.js extension/content.js extension/icons -x '.*'
unzip -l "$out"
echo "$out"
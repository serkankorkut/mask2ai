#!/bin/sh
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
files=$(node -p "const m=require('./manifest.json');[...new Set([...m.content_scripts.flatMap(c=>c.js),...Object.values(m.icons)])].join(' ')")
mkdir -p dist
out="dist/mask2ai-extension-$version.zip"
rm -f "$out"
zip -q "$out" manifest.json $files
unzip -l "$out"
echo "$out"
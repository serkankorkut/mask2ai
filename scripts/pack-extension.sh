#!/bin/sh
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
files=$(node -p "const m=require('./manifest.json');const o=m.options_ui?m.options_ui.page:null;[...new Set([...m.content_scripts.flatMap(c=>c.js),...Object.values(m.icons),...(o?[o,o.replace(/\.html$/,'.js')]:[])])].join(' ')")
mkdir -p dist
out="dist/mask2ai-extension-$version.zip"
rm -f "$out"
zip -q "$out" manifest.json $files
unzip -l "$out"
echo "$out"
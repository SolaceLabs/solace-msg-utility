#!/bin/bash
set -e

URL="https://products.solace.com/download/JS_API"
ZIP_FILE="solace_js_api.zip"

echo "📥 Downloading API..."
curl -L -o "$ZIP_FILE" "$URL"

echo "📦 Unpacking ZIP..."
unzip -o "$ZIP_FILE" -d tmp_solace

echo "📂 Moving solclient.js..."
mkdir -p dist/js
find tmp_solace -type f -path "*/lib/solclient.js" -exec mv {} dist/js/ \;

echo "🧹 Cleaning up..."
rm -rf tmp_solace "$ZIP_FILE"

echo "✅ Done! File is located at dist/js/solclient.js"
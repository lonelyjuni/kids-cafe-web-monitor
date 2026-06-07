#!/bin/bash
cd "$(dirname "$0")/.."
git pull origin main
node ubuntu/fetch-cafes.js
git add public/cafes.json
git commit -m "chore: auto-update cafes.json via cron"
git push origin main

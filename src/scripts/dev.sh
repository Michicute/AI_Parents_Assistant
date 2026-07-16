#!/usr/bin/env bash
set -euo pipefail

echo "Starting local services with Docker Compose"
docker compose up -d

echo "Run the backend in another terminal:"
echo "  npm run backend:dev"
echo "Run the frontend in another terminal:"
echo "  npm run dev"

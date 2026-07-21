#!/usr/bin/env bash
# Serve the public map on http://localhost:8080
# Python 3.x is required. Close with Ctrl+C.
set -euo pipefail
cd "$(dirname "$0")"
python -m http.server 8080

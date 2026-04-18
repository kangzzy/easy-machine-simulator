#!/bin/sh
# Copy WASM build output into the volume-mounted src/ directory
cp -r /app/wasm-pkg /app/src/wasm-pkg 2>/dev/null || true
exec "$@"

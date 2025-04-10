#!/bin/sh

echo "Starting CV preview server on http://0.0.0.0:8000"
echo "Press Ctrl+C to stop the server"

# Try to use Python's built-in HTTP server (works on most systems)
if command -v vpip > /dev/null; then
    vpy -m http.server 8000 --bind 0.0.0.0
elif command -v python3 > /dev/null; then
    python3 -m http.server 8000 --bind 0.0.0.0
elif command -v python > /dev/null; then
    python -m SimpleHTTPServer 8000 --bind 0.0.0.0
# Fallback to Node.js if Python is not available
elif command -v npx > /dev/null; then
    npx serve -s . -l 8000 --listen-host 0.0.0.0
# Last resort: inform the user to open the file directly
else
    echo "Could not start a server. Please open index.html directly in your browser."
    exit 1
fi 
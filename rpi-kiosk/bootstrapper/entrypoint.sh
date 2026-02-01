#!/bin/sh

# Start the Python Server in the background
# It binds to 0.0.0.0:5000 by default with Flask
cd /app
python3 server.py &

# Wait for server to be ready (optional, but good practice)
sleep 2

# Start Chromium pointing to the local server
# Note: we point to localhost:5000 instead of file://
chromium-browser \
    --no-sandbox \
    --kiosk \
    --fullscreen \
    --no-first-run \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=Translate \
    --app=http://localhost:5000

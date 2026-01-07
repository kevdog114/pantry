#!/bin/bash

# Default URL if not provided
TARGET_URL="${URL:-https://google.com}"

echo "Starting Kiosk Browser pointing to: $TARGET_URL"

# Disable screensaver and power management
xset -dpms     # Disable DPMS (Energy Star) features.
xset s off     # Disable screen saver.
xset s noblank # Don't blank the video device.

# Clear any previous session data (optional, ensures clean state)
rm -rf /root/.config/chromium/Singleton*

# Start Chromium in Kiosk mode
# --no-sandbox: Required for Docker usually
# --kiosk: Full screen, no address bar
# --check-for-update-interval=31536000: Disable update checks
# --incognito: Don't save history
# --disable-infobars: Remove "Chrome is being controlled..."
chromium \
  --no-sandbox \
  --kiosk \
  --fullscreen \
  --no-first-run \
  --disable-ipv6 \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --check-for-update-interval=31536000 \
  --simulator-trace-events \
  --window-position=0,0 \
  --user-data-dir="/tmp/chromium" \
  "$TARGET_URL"

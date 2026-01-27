#!/bin/bash

# Audio Configuration
echo "Configuring Audio..."

# Function to detect valid audio card
detect_audio_card() {
    # Try to find a USB audio device first
    local card=$(aplay -l | grep -i "usb" | grep "^card" | head -n 1 | awk '{print $2}' | tr -d ':')
    if [ -n "$card" ]; then
        echo "$card"
        return
    fi
    
    # Fallback to HDMI
    card=$(aplay -l | grep -i "hdmi" | grep "^card" | head -n 1 | awk '{print $2}' | tr -d ':')
    if [ -n "$card" ]; then
        echo "$card"
        return
    fi
    
    # Fallback to any card
    card=$(aplay -l | grep "^card" | head -n 1 | awk '{print $2}' | tr -d ':')
    echo "$card"
}

if [ -n "$DEFAULT_AUDIO_DEVICE" ]; then
    echo "Using configured audio device override: $DEFAULT_AUDIO_DEVICE"
    AUDIO_CARD="$DEFAULT_AUDIO_DEVICE"
else
    echo "Auto-detecting audio hardware..."
    AUDIO_CARD=$(detect_audio_card)
fi

# Default to 0 if detection failed
if [ -z "$AUDIO_CARD" ]; then
    echo "No audio devices detected, defaulting to card 0"
    AUDIO_CARD=0
fi

echo "Selected Audio Card Index: $AUDIO_CARD"

# Write asound.conf
# Use 'asym' to explicitly define both Playback (Speaker) and Capture (Mic)
# pointing to the same auto-detected card (via 'plug' for format conversion).
cat > /etc/asound.conf <<EOF
pcm.!default {
    type asym
    playback.pcm "plug:dmix_custom"
    capture.pcm "plug:dsnoop_custom"
}

pcm.dmix_custom {
    type dmix
    ipc_key 1024
    slave {
        pcm "hw:$AUDIO_CARD"
        rate 48000
        periods 128
        period_time 0
        period_size 1024
        buffer_size 4096
    }
}

pcm.dsnoop_custom {
    type dsnoop
    ipc_key 1025
    slave {
        pcm "hw:$AUDIO_CARD"
    }
}

ctl.!default {
    type hw
    card $AUDIO_CARD
}
EOF

echo "Generated /etc/asound.conf (Speaker & Mic configured for Card $AUDIO_CARD)"

# Export ALSA variables to force applications (like Chrome) to use this card
export ALSA_CARD=$AUDIO_CARD
export ALSA_PCM_CARD=$AUDIO_CARD
export ALSA_CTL_CARD=$AUDIO_CARD

# Start Hardware Bridge
echo "Starting Hardware Bridge..."
cd /bridge
node server.js > /var/log/bridge.log 2>&1 &

if [ -n "$MQTT_BROKER" ]; then
    echo "Starting MQTT Bridge..."
    /opt/venv/bin/python3 -u mqtt_bridge.py > /var/log/mqtt_bridge.log 2>&1 &
fi

# Default URL if not provided
TARGET_URL="${URL:-https://google.com}"

echo "Starting Kiosk Browser pointing to: $TARGET_URL"

# Disable screensaver and power management
xset s off     # Disable screen saver.
xset s noblank # Don't blank the video device.
xset dpms 0 0 0 # Disable DPMS timers
xset -dpms     # Disable DPMS (Energy Star) features.

# Clear any previous session data (optional, ensures clean state)
rm -f /data/SingletonSocket /data/SingletonCookie /data/SingletonLock

# Start Window Manager
matchbox-window-manager -use_titlebar no &

# Start Chromium in Kiosk mode
# --no-sandbox: Required for Docker usually
# --kiosk: Full screen, no address bar
# --check-for-update-interval=31536000: Disable update checks
# --incognito: Don't save history
# --disable-infobars: Remove "Chrome is being controlled..."
# --touch-events=enabled: Force touch support
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
  --touch-events=enabled \
  --disable-features=BlockInsecurePrivateNetworkRequests \
  --enable-features=OverlayScrollbar \
  --start-maximized \
  --window-position=0,0 \
  --pull-to-refresh=1 \
  --user-data-dir="/data" \
  --use-fake-ui-for-media-stream \
  --autoplay-policy=no-user-gesture-required \
  --unsafely-treat-insecure-origin-as-secure="$TARGET_URL" \
  "$TARGET_URL"

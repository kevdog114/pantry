#!/bin/bash

# Audio Configuration
# Playback and capture are detected separately. This kiosk plays through the HDMI
# display but records from a capture-only USB microphone, so no single card can
# serve both. Each is also looked up in the list that can actually show it: a
# capture-only mic never appears in `aplay -l`, which is why the mic used to go
# undetected and `default` ended up with no usable capture device at all.
echo "Configuring Audio..."

card_id() {
    cat "/proc/asound/card$1/id" 2>/dev/null
}

# vc4hdmiN corresponds to DRM connector HDMI-A-(N+1).
hdmi_connected() {
    local n=$1 status
    for status in /sys/class/drm/card*-HDMI-A-$((n + 1))/status; do
        [ -r "$status" ] && [ "$(cat "$status")" = "connected" ] && return 0
    done
    return 1
}

detect_playback_card() {
    local card fallback="" id
    # A USB speaker, if there is one, is the most likely intended output.
    card=$(aplay -l | grep -i "usb" | grep "^card" | head -n 1 | awk '{print $2}' | tr -d ':')
    if [ -n "$card" ]; then
        echo "$card"
        return
    fi

    # Otherwise HDMI, preferring a port with a display actually plugged in.
    for card in $(aplay -l | grep -i "hdmi" | grep "^card" | awk '{print $2}' | tr -d ':'); do
        [ -z "$fallback" ] && fallback="$card"
        id=$(card_id "$card")
        case "$id" in
            vc4hdmi*)
                if hdmi_connected "${id#vc4hdmi}"; then
                    echo "$card"
                    return
                fi
                ;;
        esac
    done
    if [ -n "$fallback" ]; then
        echo "$fallback"
        return
    fi

    # Last resort: anything that can play at all.
    aplay -l | grep "^card" | head -n 1 | awk '{print $2}' | tr -d ':'
}

detect_capture_card() {
    local card
    card=$(arecord -l | grep -i "usb" | grep "^card" | head -n 1 | awk '{print $2}' | tr -d ':')
    [ -z "$card" ] && card=$(arecord -l | grep "^card" | head -n 1 | awk '{print $2}' | tr -d ':')
    echo "$card"
}

# dsnoop needs a fixed slave format, so read it off what the mic reports rather
# than assuming. The kitchen mic, for one, is stereo-only and rejects channels 1.
mic_stream_field() {
    sed -n "s/^ *$2: *\(.*\)/\1/p" "/proc/asound/card$1/stream0" 2>/dev/null | head -n 1
}

PLAYBACK_CARD="${DEFAULT_AUDIO_DEVICE:-$(detect_playback_card)}"
CAPTURE_CARD="${CAPTURE_AUDIO_DEVICE:-$(detect_capture_card)}"

if [ -z "$PLAYBACK_CARD" ]; then
    echo "No playback device detected, defaulting to card 0"
    PLAYBACK_CARD=0
fi

echo "Playback card: $PLAYBACK_CARD ($(card_id "$PLAYBACK_CARD"))"
if [ -n "$CAPTURE_CARD" ]; then
    echo "Capture card:  $CAPTURE_CARD ($(card_id "$CAPTURE_CARD"))"
else
    echo "Capture card:  none detected - 'default' will be playback-only"
fi

MIC_CHANNELS=$(mic_stream_field "$CAPTURE_CARD" Channels)
case "$(mic_stream_field "$CAPTURE_CARD" Rates)" in
    *48000*) MIC_RATE=48000 ;;
    *44100*) MIC_RATE=44100 ;;
    *16000*) MIC_RATE=16000 ;;
    *)       MIC_RATE=48000 ;;
esac

# Write asound.conf. 'asym' pairs the two directions; the 'plug' wrappers let
# callers use any rate or channel count (baresip asks for 8 kHz mono on G.711,
# the browser for 48 kHz stereo) and ALSA converts.
{
    echo "pcm.!default {"
    echo "    type asym"
    echo "    playback.pcm \"kiosk_out\""
    [ -n "$CAPTURE_CARD" ] && echo "    capture.pcm \"kiosk_in\""
    echo "}"
    echo
    echo "pcm.kiosk_out {"
    echo "    type plug"
    echo "    slave {"
    echo "        pcm \"kiosk_playback\""
    echo "        rate 48000"
    echo "    }"
    echo "}"
    echo

    case "$(card_id "$PLAYBACK_CARD")" in
        vc4hdmi*)
            # Raspberry Pi HDMI exposes IEC958_SUBFRAME_LE and nothing else, so it
            # needs the iec958 plugin; plug and dmix cannot build subframes. dmix
            # also refuses to sit on anything but a raw hw device, so HDMI output
            # is exclusive - one player at a time. Channel status 04 82 00 02 is
            # consumer PCM, no emphasis, 48 kHz, matching the rate pinned above.
            echo "pcm.kiosk_playback {"
            echo "    type iec958"
            echo "    slave {"
            echo "        pcm \"hw:$PLAYBACK_CARD,0\""
            echo "        format IEC958_SUBFRAME_LE"
            echo "    }"
            echo "    status [ 0x04 0x82 0x00 0x02 ]"
            echo "}"
            ;;
        *)
            # An ordinary card can mix in software. buffer_size has to be a whole
            # multiple of period_size - the previous config declared 128 periods
            # alongside a 4-period buffer, and dmix refused to initialise.
            echo "pcm.kiosk_playback {"
            echo "    type dmix"
            echo "    ipc_key 1024"
            echo "    slave {"
            echo "        pcm \"hw:$PLAYBACK_CARD,0\""
            echo "        rate 48000"
            echo "        period_size 1024"
            echo "        buffer_size 4096"
            echo "    }"
            echo "}"
            ;;
    esac

    if [ -n "$CAPTURE_CARD" ]; then
        # dsnoop, unlike a bare hw device, lets several readers share the mic at
        # once - the browser's voice commands and a SIP call can both have it.
        echo
        echo "pcm.kiosk_in {"
        echo "    type plug"
        echo "    slave.pcm \"kiosk_capture\""
        echo "}"
        echo
        echo "pcm.kiosk_capture {"
        echo "    type dsnoop"
        echo "    ipc_key 1025"
        echo "    slave {"
        echo "        pcm \"hw:$CAPTURE_CARD,0\""
        echo "        channels ${MIC_CHANNELS:-2}"
        echo "        rate $MIC_RATE"
        echo "        period_size 1024"
        echo "        buffer_size 4096"
        echo "    }"
        echo "}"
    fi

    echo
    echo "ctl.!default {"
    echo "    type hw"
    echo "    card $PLAYBACK_CARD"
    echo "}"
} > /etc/asound.conf

echo "Generated /etc/asound.conf (playback card $PLAYBACK_CARD, capture card ${CAPTURE_CARD:-none})"

# Applications that consult these (Chromium among them) get pointed at the
# playback card. 'default' above routes both directions explicitly, so these only
# affect the stock sysdefault/front devices.
export ALSA_CARD=$PLAYBACK_CARD
export ALSA_PCM_CARD=$PLAYBACK_CARD
export ALSA_CTL_CARD=$PLAYBACK_CARD

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

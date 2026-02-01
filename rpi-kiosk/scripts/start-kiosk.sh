#!/bin/bash

# Pantry Kiosk Startup Script
# This script manages the startup sequence:
# 1. Shows a lightweight bootstrapper (loading screen)
# 2. Updates the main kiosk application
# 3. Launches the main application

# Configuration
BOOTSTRAP_IMAGE="klschaefer/pantry-bootstrapper:latest"
MAIN_IMAGE="klschaefer/pantry-kiosk:latest"

# Default URL if not set in environment
if [ -z "$URL" ]; then
  URL="https://pantry.yourdomain.com"
fi

echo "--- Pantry Kiosk Startup ---"

# Step 1: Ensure Bootstrapper is available
# We only pull if missing to ensure instant startup.
if [[ "$(docker images -q $BOOTSTRAP_IMAGE 2> /dev/null)" == "" ]]; then
  echo "Bootstrapper image not found. Pulling..."
  docker pull $BOOTSTRAP_IMAGE
fi

# Step 2: Start Bootstrapper
# - It mounts the docker socket to control the host docker daemon
# - It pulls the main image while showing a progress UI
# - It exists when done
echo "Starting Bootstrapper..."
docker run --rm \
  --name pantry-bootstrapper \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e DISPLAY=:0 \
  -e TARGET_IMAGE="$MAIN_IMAGE" \
  $BOOTSTRAP_IMAGE

# Step 3: Start Main Application
# By this point, the main image has been pulled by the bootstrapper
echo "Launching Kiosk..."
docker run --rm \
  --name pantry-kiosk \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -v /dev/bus/usb:/dev/bus/usb \
  -v /dev/input:/dev/input \
  -v pantry_data:/data \
  -v /etc/localtime:/etc/localtime:ro \
  -v /etc/timezone:/etc/timezone:ro \
  --device /dev/snd \
  --privileged \
  -e DISPLAY=:0 \
  -e URL="$URL" \
  --ipc=host \
  $MAIN_IMAGE

# Raspberry Pi Kiosk Docker Image

This directory contains the Docker configuration for a lightweight, Kiosk-mode web browser designed to run on a Raspberry Pi. It is intended to display the Pantry App on a connected HDMI screen.

## Recommended Hardware & OS
## Recommended Hardware & OS
*   **Hardware**: Raspberry Pi 4 or 5 is recommended for smooth modern web browsing.
*   **OS**: Raspberry Pi OS Lite (64-bit). The "Lite" version is preferred as we will install a minimal display environment, avoiding the overhead of a full desktop.

## Features
*   **Optimized Image**: Builds using a multi-stage Dockerfile to minimize image size (~1GB -> reduced) by excluding build tools and using Python virtual environments.
*   **Native Label Printing**: Uses `brother_ql_inventree` python library to print to Brother QL-600 series printers directly via USB. Supports automatic printer discovery and status monitoring (online/offline, media type).
*   **Hardware Bridge**: Runs a local websocket bridge to communicate between the Web App and USB Hardware, facilitating printer discovery and real-time status updates.
*   **MQTT Integration**: Connects to an MQTT Broker to expose the display controls to Home Assistant. **Auto-Configures** using the Kiosk Name assigned during login.

## Installation Guide

### 1. Prepare Key Dependencies
On your Raspberry Pi (running Raspberry Pi OS Lite), install the minimal X Window System:

```bash
sudo apt update
sudo apt install -y --no-install-recommends xserver-xorg x11-xserver-utils xinit
```

### 2. Install Docker
If you haven't installed Docker yet:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```
*Logout and log back in for permissions to take effect.*

### 3. Configure Auto-Start
We want the Pi to automatically log in and start the browser.

#### Enable Console Auto-Login
1.  Run `sudo raspi-config`
2.  Navigate to **System Options** -> **Boot / Auto Login**.
3.  Select **Console Autologin**.
4.  Finish and Reboot.

#### Configure X to Start on Login
Edit your profile to start the X server automatically when the default user logs in.
Edit `~/.bash_profile`:
```bash
nano ~/.bash_profile
```
Add this to the bottom:
```bash
if [[ -z $DISPLAY ]] && [[ $(tty) = /dev/tty1 ]]; then
  startx -- -nocursor
fi
```

#### Create the Kiosk Startup Script
Create (or edit) the `~/.xinitrc` file. This script runs when X starts.

```bash
nano ~/.xinitrc
```

Paste the following content. **Make sure to update `YOUR_URL` locally if you want to test, but the Docker image also accepts it as an env var.**

```bash
#!/bin/sh

# Disable power saving (screen blanking)
xset -dpms
xset s off
xset s noblank

# Allow the Docker container to communicate with the X server
xhost +local:root

# Run the Kiosk Docker Container
# --ipc=host: Recommended for Chrome in Docker to avoid shared memory crashes
# -v /tmp/.X11-unix:/tmp/.X11-unix: Share the display socket
# --privileged: Required for direct access to USB devices (Label Printer)
# -v /dev/bus/usb:/dev/bus/usb: Share USB devices
docker run --rm \
  --name pantry-kiosk \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -v /dev/bus/usb:/dev/bus/usb \
  -v pantry_data:/data \
  --privileged \
  -e DISPLAY=:0 \
  -e URL="https://pantry.yourdomain.com" \
  # Optional: MQTT Integration (Home Assistant)
  # -e MQTT_BROKER="192.168.1.10" \
  # -e MQTT_PORT=1883 \
  # -e MQTT_USER="homeassistant" \
  # -e MQTT_PASSWORD="password" \
  # -e KIOSK_ID="pantry_kiosk" \
  --ipc=host \
  --pull=always \
  klschaefer/pantry-kiosk:latest
```
*(Replace `klschaefer/pantry-kiosk:latest` with your proper image tag if different)*

Make it executable (optional typically, but good practice):
```bash
chmod +x ~/.xinitrc
```

### 4. Reboot
Now, when you reboot (`sudo reboot`), the Pi should:
1.  Auto-login users.
2.  Start X11.
3.  Launch the Docker container displaying the website in full screen.

## Troubleshooting
*   **Black Screen**: Ensure `xhost +local:root` is running. Check docker logs: `docker logs pantry-kiosk`.
*   **Resolution Issues**: Run `sudo raspi-config` -> Display Options to force a specific HDMI resolution if it's not detected correctly.

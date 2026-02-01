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
# Run the Kiosk Startup Script
# This script handles:
# 1. Starting a fast-loading bootstrapper (loading screen)
# 2. Updating the main application
# 3. Launching the main Kiosk
#
# You can copy the script from `scripts/start-kiosk.sh` in this repo, or paste the following:

~/start-kiosk.sh
```

Create the `~/start-kiosk.sh` script:

```bash
nano ~/start-kiosk.sh
```

Paste the content from `scripts/start-kiosk.sh` (available in this repository).  
Remember to make it executable:
```bash
chmod +x ~/start-kiosk.sh
```

### Script Content (for reference):
```bash
#!/bin/bash
BOOTSTRAP_IMAGE="klschaefer/pantry-bootstrapper:latest"
MAIN_IMAGE="klschaefer/pantry-kiosk:latest"
URL="${URL:-https://pantry.yourdomain.com}"

# 1. Start Bootstrapper
if [[ "$(docker images -q $BOOTSTRAP_IMAGE 2> /dev/null)" == "" ]]; then
  echo "Pulling bootstrapper..."
  docker pull $BOOTSTRAP_IMAGE
fi

# Run Bootstrapper (mounts docker socket to perform self-update)
docker run --rm \
  --name pantry-bootstrapper \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e DISPLAY=:0 \
  -e TARGET_IMAGE="$MAIN_IMAGE" \
  $BOOTSTRAP_IMAGE

# 3. Switch to Main Image
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

## Hardware Setup

### Audio Configuration
The kiosk application includes a robust **Hardware-Agnostic Audio Layer**.
*   **Auto-Detection**: On startup, the container automatically scans for available audio devices. It prioritizes USB audio devices, then falls back to HDMI, and finally to the default system output.
*   **Manual Override**: If the auto-detection picks the wrong device (e.g., HDMI instead of USB speakers), you can force a specific device by setting the `DEFAULT_AUDIO_DEVICE` environment variable.
*   **UI Settings**: (Planned) In the future, you will be able to switch between recognized audio devices directly from the Kiosk Settings UI.

To manually specify an audio device, add `-e DEFAULT_AUDIO_DEVICE=1` (where 1 is the card index from `aplay -l`) to your Docker run command.

### Label Printer
Connect your Brother QL-600 series printer via USB. The system will automatically detect it and configure the backend to use it. No extra drivers are needed on the host system as the container handles the communication.

## Troubleshooting
*   **Black Screen**: Ensure `xhost +local:root` is running. Check docker logs: `docker logs pantry-kiosk`.
*   **Resolution Issues**: Run `sudo raspi-config` -> Display Options to force a specific HDMI resolution if it's not detected correctly.

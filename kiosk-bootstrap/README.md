# Kiosk Bootstrap

This directory contains a lightweight bootstrap application designed to start the Pantry Kiosk.
It provides a visual "Loading..." interface while it pulls the latest Kiosk Docker image and starts the container.

## Features
- **Fast Startup**: Starts immediately to provide visual feedback.
- **Visual Feedback**: Shows a loading animation (spinner) and progress status.
- **Auto-Updates**: Automatically pulls the `klschaefer/pantry-kiosk:latest` image.
- **Container Management**: Stops any existing kiosk container and starts a new one with the correct flags.

## Building the Image

```bash
docker build -t klschaefer/kiosk-bootstrap:latest .
```

## Usage

Update your `~/.xinitrc` on the Kiosk/Raspberry Pi to run this bootstrap image instead of the main kiosk image.

Replace your existing `docker run` command with:

```bash
docker run --rm \
  --name kiosk-bootstrap \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -e DISPLAY=:0 \
  -e URL="https://pantry.yourdomain.com" \
  klschaefer/kiosk-bootstrap:latest
```

**Note**:
- Requires `-v /var/run/docker.sock:/var/run/docker.sock` so the bootstrap app can control Docker to pull/run the main kiosk.
- The bootstrap app will perform the complex `docker run` command for the main kiosk (handling devices, volumes, etc.) internally.

## Customization
- **Background**: Replace `assets/background.png` with your own image.
- **Configuration**: Edit `main.py` to change the target image name or startup flags.

#!/bin/bash
set -e

echo "Starting Playwright MCP Container..."

# Start Xvfb
echo "Starting Xvfb on display :99..."
Xvfb :99 -screen 0 ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH} &
sleep 2

# Start fluxbox window manager
echo "Starting Fluxbox window manager..."
DISPLAY=:99 fluxbox &
sleep 2

# Start VNC server
echo "Starting VNC server on port ${VNC_PORT}..."
x11vnc -display :99 -forever -shared -rfbport ${VNC_PORT} -passwd ${VNC_PASSWORD} -xkb -noxrecord -noxfixes -noxdamage &
sleep 2

# Start noVNC
echo "Starting noVNC on port ${NOVNC_PORT}..."
/opt/novnc/utils/novnc_proxy --vnc localhost:${VNC_PORT} --listen ${NOVNC_PORT} &
sleep 2

# Start Playwright MCP server
echo "Starting Playwright MCP server on port ${MCP_PORT}..."
DISPLAY=:99 npx @playwright/mcp@latest --port ${MCP_PORT} --browser chromium

# Keep container running
wait

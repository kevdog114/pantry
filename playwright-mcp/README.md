# Playwright MCP Container

This container provides a Playwright MCP server with VNC access for browser automation and viewing.

## Features

- **Playwright MCP Server**: HTTP-based MCP interface for browser automation
- **VNC Access**: Virtual display with VNC server for visual access
- **noVNC Web Interface**: Browser-based VNC viewer
- **Headed Browser**: Run Chromium in headed mode (visible)

## Ports

| Port | Service | Description |
|------|---------|-------------|
| 5900 | VNC | Raw VNC protocol access |
| 6080 | noVNC | Web-based VNC viewer |
| 8931 | MCP | Playwright MCP HTTP API |

## Quick Start

### Using Docker Compose

From the project root:

```bash
# Development
docker-compose -f docker-compose.dev.yml up playwright-mcp

# Production
docker-compose up playwright-mcp
```

### Direct Docker Run

```bash
docker build -t playwright-mcp ./playwright-mcp
docker run -d \
  --name playwright-mcp \
  -p 5900:5900 \
  -p 6080:6080 \
  -p 8931:8931 \
  -e VNC_PASSWORD=playwright \
  playwright-mcp
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VNC_PASSWORD` | `playwright` | Password for VNC access |
| `VNC_PORT` | `5900` | VNC server port (internal) |
| `NOVNC_PORT` | `6080` | noVNC web port (internal) |
| `MCP_PORT` | `8931` | Playwright MCP port (internal) |
| `SCREEN_WIDTH` | `1920` | Virtual screen width |
| `SCREEN_HEIGHT` | `1080` | Virtual screen height |
| `SCREEN_DEPTH` | `24` | Virtual screen color depth |

## Accessing the Browser

### Web VNC Viewer

Open in your browser:
```
http://localhost:6080/vnc.html?autoconnect=true
```

### VNC Client

Connect to `localhost:5900` with your preferred VNC client.

## API Endpoints

The Pantry API provides a proxy layer for the MCP server:

### Status & Configuration

- `GET /playwright/status` - Get container status
- `GET /playwright/config` - Get connection configuration

### Browser Navigation

- `POST /playwright/navigate` - Navigate to URL
- `POST /playwright/go-back` - Go back in history
- `POST /playwright/go-forward` - Go forward in history
- `GET /playwright/snapshot` - Get page accessibility snapshot

### Interactions

- `POST /playwright/click` - Click an element
- `POST /playwright/type` - Type text into an element
- `POST /playwright/fill` - Fill a form field
- `POST /playwright/hover` - Hover over an element
- `POST /playwright/press-key` - Press a keyboard key
- `POST /playwright/select` - Select from dropdown

### Utilities

- `POST /playwright/screenshot` - Take a screenshot
- `POST /playwright/resize` - Resize browser window
- `GET /playwright/console` - Get console messages
- `POST /playwright/close` - Close the browser
- `POST /playwright/tool` - Execute any MCP tool

## Pantry Backend Configuration

Add these environment variables to your API server:

```env
PLAYWRIGHT_MCP_HOST=localhost    # or 'playwright-mcp' in Docker network
PLAYWRIGHT_MCP_PORT=8931
PLAYWRIGHT_NOVNC_HOST=localhost  # or 'playwright-mcp' in Docker network
PLAYWRIGHT_NOVNC_PORT=6080
```

## UI Access

Navigate to `/browser` in the Pantry UI to access the browser viewer page.

## MCP Tool Reference

The Playwright MCP server provides these tools:

### Navigation
- `browser_navigate` - Navigate to URL
- `browser_go_back` - Go back
- `browser_go_forward` - Go forward
- `browser_reload` - Reload page

### Interaction
- `browser_click` - Click element
- `browser_type` - Type with keyboard simulation
- `browser_fill` - Fill input directly
- `browser_hover` - Hover over element
- `browser_press_key` - Press keyboard key
- `browser_select_option` - Select dropdown option
- `browser_drag` - Drag and drop

### Inspection
- `browser_snapshot` - Get accessibility tree
- `browser_screen_capture` - Take screenshot
- `browser_console_messages` - Get console logs

### Window
- `browser_resize` - Resize viewport
- `browser_close` - Close browser

### Dialogs & Files
- `browser_handle_dialog` - Accept/dismiss dialogs
- `browser_file_upload` - Upload files

## Troubleshooting

### VNC Connection Failed
1. Ensure the container is running: `docker ps | grep playwright`
2. Check container logs: `docker logs playwright-mcp`
3. Verify ports are exposed: `docker port playwright-mcp`

### MCP Connection Failed
1. Wait for the container to fully start (services start sequentially)
2. Check if MCP server is running: `curl http://localhost:8931/mcp`

### Browser Not Starting
1. Check Xvfb is running in container logs
2. Verify DISPLAY environment variable is set to `:99`

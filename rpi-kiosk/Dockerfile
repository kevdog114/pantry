# Stage 1: Builder
#FROM node:20-bookworm-slim AS builder
FROM node:20-bullseye-slim AS builder

# Install Python for venv building
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    build-essential \
    python3-dev \
    --no-install-recommends

# Setup Node modules
WORKDIR /bridge
COPY bridge/package.json .
RUN npm install --omit=dev

# Setup Python Venv
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir brother-ql-inventree Pillow qrcode[pil] pyusb paho-mqtt evdev python-escpos pyserial

# Stage 2: Runtime
#FROM debian:bookworm-slim
FROM debian:bullseye-slim

# Install Runtime Dependencies
# Removes printer-driver-ptouch (using python driver now)
# Removes build tools
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-roboto \
    usbutils \
    matchbox-window-manager \
    python3 \
    libopenjp2-7 \
    curl \
    libusb-1.0-0 \
    x11-xserver-utils \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy Node.js binary from builder (compatible bookworm-slim base)
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
# Ensure we refer to it correctly later

# Copy Built Resources
COPY --from=builder /bridge/node_modules /bridge/node_modules
COPY --from=builder /opt/venv /opt/venv

# Install Arduino CLI
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh -s -- -b /usr/local/bin
RUN arduino-cli config init
RUN arduino-cli core update-index
RUN arduino-cli core install arduino:avr

# Setup App
WORKDIR /bridge
COPY bridge/package.json .
COPY bridge/server.js .
COPY bridge/scanner_service.js .
COPY bridge/scanner_bridge.py .
COPY bridge/print_label.py .
COPY bridge/receipt_printer.py .
COPY bridge/mqtt_bridge.py .
COPY bridge/scale_bridge.py .
COPY bridge/flash_tool.py .

# Copy Firmware (requires context to include arduino folder)
COPY arduino /bridge/firmware

# Setup Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Environment variables
ENV URL="https://google.com"
ENV DISPLAY=:0
ENV UDEV=1
ENV PATH="/opt/venv/bin:$PATH"

# Run the script
ENTRYPOINT ["/entrypoint.sh"]

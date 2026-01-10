# Stage 1: Builder
FROM node:20-bookworm-slim AS builder

# Install Python for venv building
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    --no-install-recommends

# Setup Node modules
WORKDIR /bridge
COPY bridge/package.json .
RUN npm install --omit=dev

# Setup Python Venv
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir brother_ql_inventree Pillow qrcode[pil] pyusb

# Stage 2: Runtime
FROM debian:bookworm-slim

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
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy Node.js binary from builder (compatible bookworm-slim base)
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
# Ensure we refer to it correctly later

# Copy Built Resources
COPY --from=builder /bridge/node_modules /bridge/node_modules
COPY --from=builder /opt/venv /opt/venv

# Setup App
WORKDIR /bridge
COPY bridge/package.json .
COPY bridge/server.js .
COPY bridge/print_label.py .

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

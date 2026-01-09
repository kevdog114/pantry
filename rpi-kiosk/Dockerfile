FROM debian:bookworm-slim

# Install Chromium and necessary fonts/libs
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-roboto \
    usbutils \
    printer-driver-ptouch \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    libopenjp2-7 \
    --no-install-recommends \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Setup Bridge
WORKDIR /bridge
COPY bridge/package.json .
RUN npm install
COPY bridge/server.js .
COPY bridge/print_label.py .

# Install Python dependencies for Brother QL
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir brother_ql Pillow qrcode[pil]

# Copy startup script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Environment variables
ENV URL="https://google.com"
ENV DISPLAY=:0
ENV UDEV=1

# Run the script
ENTRYPOINT ["/entrypoint.sh"]

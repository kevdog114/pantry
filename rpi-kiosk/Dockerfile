FROM debian:bookworm-slim

# Install Chromium and necessary fonts/libs
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-roboto \
    x11-xserver-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy startup script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Environment variables
ENV URL="https://google.com"
ENV DISPLAY=:0
ENV UDEV=1

# Run the script
ENTRYPOINT ["/entrypoint.sh"]

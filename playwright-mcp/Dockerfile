# Playwright MCP Container with VNC/noVNC support
FROM mcr.microsoft.com/playwright:v1.52.0-noble

# Install necessary packages
RUN apt-get update && apt-get install -y \
    xvfb \
    tigervnc-standalone-server \
    tigervnc-common \
    fluxbox \
    net-tools \
    python3 \
    python3-pip \
    git \
    supervisor \
    socat \
    && rm -rf /var/lib/apt/lists/*

# Install websockify and noVNC
RUN pip3 install --break-system-packages websockify \
    && git clone https://github.com/novnc/noVNC.git /opt/novnc

# Install Playwright MCP
RUN npm install -g @playwright/mcp@latest

# Create working directory
WORKDIR /app

# Copy supervisor configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy start script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Environment variables
ENV DISPLAY=:99
ENV VNC_PASSWORD=playwright
ENV VNC_PORT=5900
ENV NOVNC_PORT=6080
ENV MCP_PORT=8931
ENV SCREEN_WIDTH=1920
ENV SCREEN_HEIGHT=1080
ENV SCREEN_DEPTH=24

# Expose ports
# 5900 - VNC
# 6080 - noVNC
# 8931 - Playwright MCP
EXPOSE 5900 6080 8931

# Start services via supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

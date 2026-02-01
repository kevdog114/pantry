FROM alpine:latest

# Install Chromium, Python, and dependencies
RUN apk add --no-cache \
    chromium \
    mesa-gl \
    mesa-egl \
    ttf-freefont \
    font-noto \
    freetype \
    python3 \
    py3-pip

# Install Python packages
COPY requirements.txt /app/requirements.txt
RUN pip3 install --break-system-packages -r /app/requirements.txt

# Copy the static website and server script
COPY src /app

# Environment variables
ENV DISPLAY=:0
ENV FLASK_APP=server.py

# Entrypoint updates to use a startup script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

#!/bin/sh
set -e

# Replace environment variables in env.template.js and output to env.js
# We use envsubst to replace ${VAR} placeholders with actual environment variable values.
envsubst < /usr/share/nginx/html/assets/env.template.js > /usr/share/nginx/html/assets/env.js

# Execute the command passed to this script (CMD in Dockerfile)
exec "$@"

#!/bin/sh

# Exit immediately if a command exits with a non-zero status.
set -e

# Replace placeholders in the environment file.
# The `|` is used as a separator for sed to avoid issues with URLs in API_BASEURL.
sed -i "s|api_base_url_here|${API_BASEURL}|g" /app/src/environments/environment.production.ts
sed -i "s|site_title_here|${SITE_TITLE}|g" /app/src/environments/environment.production.ts

# Execute the command passed to this script, or 'ng serve' if none is passed.
exec "$@"

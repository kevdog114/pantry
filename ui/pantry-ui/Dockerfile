# Stage 1: Build the Angular App
FROM node:22-alpine AS builder

WORKDIR /app

# Install CLI globally
RUN npm install -g @angular/cli@19

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
# This compiles the app to static files in /app/dist/your-app-name
RUN ng build --configuration production

# Stage 2: Serve with Nginx (The "Kiosk" Runtime)
FROM nginx:alpine

# Copy the build output from Stage 1
# IMPORTANT: Replace 'pantry-ui' with the actual project name from your angular.json
COPY --from=builder /app/dist/pantry-ui/browser /usr/share/nginx/html

# Optional: Add a custom nginx config if you need to handle deep linking (Angular routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
FROM node:22-alpine

RUN mkdir /app
WORKDIR /app

COPY ui/pantry-ui/package.json ui/pantry-ui/package-lock.json ./
RUN npm ci

COPY ui/pantry-ui/. .
CMD ["ng", "serve", "--host", "0.0.0.0"]
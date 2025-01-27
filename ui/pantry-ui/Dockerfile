FROM node:22-alpine

ARG api_baseurl
ARG site_title

RUN mkdir /app
WORKDIR /app

RUN  npm install -g @angular/cli@19

COPY ui/pantry-ui/package.json ui/pantry-ui/package-lock.json ./
RUN npm ci

COPY ui/pantry-ui/. .

RUN sed -i "s|api_base_url_here|$api_baseurl|g" src/environments/environment.production.ts
RUN sed -i "s|site_title_here|$site_title|g" src/environments/environment.production.ts


CMD ["ng", "serve", "--host", "0.0.0.0", "--configuration", "production"]

FROM node:22-alpine

RUN mkdir /app
WORKDIR /app

RUN  npm install -g @angular/cli@19

COPY ui/pantry-ui/package.json ui/pantry-ui/package-lock.json ./
RUN npm ci

COPY ui/pantry-ui/. .

RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

CMD ["ng", "serve", "--host", "0.0.0.0", "--configuration", "production"]

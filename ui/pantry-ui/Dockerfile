FROM ubuntu:latest

RUN apt-get update && apt-get install -y nodejs npm

RUN mkdir /app
WORKDIR /app

RUN  npm install -g @angular/cli@19

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

CMD ["ng", "serve", "--host", "0.0.0.0", "--configuration", "production"]

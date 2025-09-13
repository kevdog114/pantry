FROM node:22-alpine

RUN apk add --no-cache python3 py3-setuptools make g++

RUN mkdir /app
RUN mkdir /app/data
RUN mkdir /app/data/upload
WORKDIR /app

COPY api/package.json api/package-lock.json ./
RUN npm ci

COPY api/. .



RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]
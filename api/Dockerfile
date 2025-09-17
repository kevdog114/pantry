FROM node:22-alpine

ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

RUN apk add --no-cache python3 py3-setuptools make g++ openssl openssl-dev

RUN mkdir /app
RUN mkdir /app/data
RUN mkdir /app/data/upload
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-arm64,linux-musl-x64
RUN npx prisma generate

RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]
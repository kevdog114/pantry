FROM node:22-alpine

ARG TARGETARCH
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

RUN apk add --no-cache python3 py3-setuptools make g++ openssl openssl-dev ffmpeg

RUN mkdir /app
RUN mkdir /app/data
RUN mkdir /app/data/upload
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN if [ "$TARGETARCH" = "amd64" ]; then \
    export PRISMA_CLI_BINARY_TARGETS=debian-openssl-1.1.x; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
    export PRISMA_CLI_BINARY_TARGETS=linux-arm64-openssl-1.1.x; \
    fi && \
    npx prisma generate

RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]